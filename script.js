// Get DOM elements
const imageLoader = document.getElementById('image-loader');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const colorCountInput = document.getElementById('color-count');
const colorPaletteContainer = document.getElementById('color-palette');
const originalViewBtn = document.getElementById('original-view-btn');
const quantizedViewBtn = document.getElementById('quantized-view-btn');
const pbnViewBtn = document.getElementById('pbn-view-btn');

// State variables
let originalImage = null;
let dominantColors = [];
let quantizedImageData = null;
let coloredRegionsImageData = null;
let pbnImageData = null;
let currentView = 'original';

// --- Event Listeners ---
imageLoader.addEventListener('change', (e) => {
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            originalImage = img;
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            processImage();
        }
        img.src = event.target.result;
    }
    reader.readAsDataURL(e.target.files[0]);
});

colorCountInput.addEventListener('change', () => {
    if (originalImage) {
        processImage();
    }
});

originalViewBtn.addEventListener('click', () => switchView('original'));
quantizedViewBtn.addEventListener('click', () => switchView('quantized'));
pbnViewBtn.addEventListener('click', () => switchView('pbn'));

// --- Core Logic ---

/**
 * Main function to process the uploaded image.
 * This is triggered on image upload and when the color count is changed.
 */
function processImage() {
    if (!originalImage) return;

    // Ensure we are working with the original image data, not a modified canvas
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = originalImage.width;
    tempCanvas.height = originalImage.height;
    tempCtx.drawImage(originalImage, 0, 0);
    const imageData = tempCtx.getImageData(0, 0, originalImage.width, originalImage.height);

    const k = parseInt(colorCountInput.value, 10);
    const allPixels = getPixels(imageData);

    // Optimization: Use a sample of pixels for k-means
    const pixelSample = samplePixels(allPixels, 30000);

    const initialK = Math.min(k * 5, 50); // Generate more colors initially
    const kmeansResult = kmeans(pixelSample, initialK);
    dominantColors = generateOptimalPalette(kmeansResult.centroids, kmeansResult.clusters, k);
    
    displayPalette(dominantColors);

    // New segmentation and PBN generation logic
    const results = generatePbnImage(imageData, dominantColors);
    pbnImageData = results.pbn;
    coloredRegionsImageData = results.colored;

    // The 'quantized' view will now show the result of the new segmentation
    quantizedImageData = results.colored;

    switchView(currentView);
}

/**
 * Reduces the number of pixels to a smaller sample for faster k-means processing.
 * @param {Array<Array<number>>} pixels - The array of all pixels in the image.
 * @param {number} sampleSize - The desired number of pixels in the sample.
 * @returns {Array<Array<number>>} A smaller array of pixels.
 */
function samplePixels(pixels, sampleSize) {
    if (pixels.length <= sampleSize) {
        return pixels;
    }
    const sample = [];
    const step = Math.floor(pixels.length / sampleSize);
    for (let i = 0; i < pixels.length; i += step) {
        sample.push(pixels[i]);
    }
    return sample;
}

/**
 * Extracts pixel data from an ImageData object into a more usable array format.
 * @param {ImageData} imageData - The ImageData object from the canvas.
 * @returns {Array<Array<number>>} An array of pixels, where each pixel is an [R, G, B] array.
 */
function getPixels(imageData) {
    const pixels = [];
    for (let i = 0; i < imageData.data.length; i += 4) {
        pixels.push([
            imageData.data[i],
            imageData.data[i + 1],
            imageData.data[i + 2]
        ]);
    }
    return pixels;
}

// --- K-Means Clustering ---

/**
 * Calculates the Euclidean distance between two colors.
 * @param {Array<number>} p1 - The first color [R, G, B].
 * @param {Array<number>} p2 - The second color [R, G, B].
 * @returns {number} The distance between the two colors.
 */
function euclideanDistance(p1, p2) {
    return Math.sqrt(
        Math.pow(p1[0] - p2[0], 2) +
        Math.pow(p1[1] - p2[1], 2) +
        Math.pow(p1[2] - p2[2], 2)
    );
}

/**
 * Finds the dominant colors in an image using the k-means clustering algorithm.
 * @param {Array<Array<number>>} pixels - An array of pixels to analyze.
 * @param {number} k - The number of clusters (dominant colors) to find.
 * @returns {object} An object containing the `centroids` and the `clusters`.
 */
function kmeans(pixels, k) {
    // 1. Initialize centroids randomly
    let centroids = [];
    // To ensure more diverse starting points, let's pick them more randomly
    const usedIndices = new Set();
    while(centroids.length < k && centroids.length < pixels.length) {
        const index = Math.floor(Math.random() * pixels.length);
        if (!usedIndices.has(index)) {
            centroids.push(pixels[index]);
            usedIndices.add(index);
        }
    }

    let iterations = 0;
    const maxIterations = 30; // Limit iterations to prevent infinite loops
    let lastCentroids;
    let clusters; // Declare clusters here to access it after the loop

    while (iterations < maxIterations) {
        // 2. Create clusters
        clusters = Array.from({ length: k }, () => []);

        // 3. Assign each pixel to the closest centroid
        for (const pixel of pixels) {
            let minDistance = Infinity;
            let closestCentroidIndex = 0;
            for (let i = 0; i < k; i++) {
                const distance = euclideanDistance(pixel, centroids[i]);
                if (distance < minDistance) {
                    minDistance = distance;
                    closestCentroidIndex = i;
                }
            }
            clusters[closestCentroidIndex].push(pixel);
        }

        // 4. Recalculate centroids
        let newCentroids = [];
        for (let i = 0; i < k; i++) {
            if (clusters[i].length > 0) {
                const mean = clusters[i].reduce((acc, pixel) => {
                    return [acc[0] + pixel[0], acc[1] + pixel[1], acc[2] + pixel[2]];
                }, [0, 0, 0]).map(val => Math.round(val / clusters[i].length));
                newCentroids.push(mean);
            } else {
                // If a cluster is empty, re-initialize its centroid
                newCentroids.push(pixels[Math.floor(Math.random() * pixels.length)]);
            }
        }
        
        // 5. Check for convergence
        lastCentroids = centroids;
        centroids = newCentroids;

        let converged = true;
        if (!lastCentroids) converged = false;
        else {
            for (let i = 0; i < k; i++) {
                if (!lastCentroids[i] || euclideanDistance(lastCentroids[i], centroids[i]) > 1) { // Convergence threshold
                    converged = false;
                    break;
                }
            }
        }

        if (converged) {
            break;
        }
        
        iterations++;
    }

    return { centroids, clusters };
}

/**
 * Selects a final palette of k colors that are visually distinct.
 * It starts with a larger-than-needed set of centroids and picks the most distinct ones.
 * @param {Array<Array<number>>} centroids - The initial list of dominant colors.
 * @param {Array<Array<Array<number>>>} clusters - The pixel clusters corresponding to the centroids.
 * @param {number} k - The desired final number of colors.
 * @returns {Array<Array<number>>} The final optimized color palette.
 */
function generateOptimalPalette(centroids, clusters, k) {
    if (centroids.length <= k) {
        return centroids.sort((a, b) => {
            const aLuminance = 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
            const bLuminance = 0.2126 * b[0] + 0.7152 * b[1] + 0.0722 * b[2];
            return aLuminance - bLuminance;
        });
    }

    // Combine centroids with their cluster size
    const weightedCentroids = centroids.map((centroid, i) => ({
        color: centroid,
        size: clusters[i] ? clusters[i].length : 0
    })).filter(c => c.size > 0); // Filter out empty clusters

    // Sort by cluster size (dominance)
    weightedCentroids.sort((a, b) => b.size - a.size);

    const finalPalette = [];
    const candidates = weightedCentroids.map(c => c.color);

    // 1. Start with the most dominant color
    if (candidates.length > 0) {
        finalPalette.push(candidates.shift());
    }

    // 2. Greedily select the most distinct remaining colors
    while (finalPalette.length < k && candidates.length > 0) {
        let bestCandidate = null;
        let maxMinDistance = -1;

        for (const candidate of candidates) {
            let minDistanceToPalette = Infinity;
            for (const color of finalPalette) {
                const distance = euclideanDistance(candidate, color);
                if (distance < minDistanceToPalette) {
                    minDistanceToPalette = distance;
                }
            }
            if (minDistanceToPalette > maxMinDistance) {
                maxMinDistance = minDistanceToPalette;
                bestCandidate = candidate;
            }
        }
        
        if (bestCandidate) {
            finalPalette.push(bestCandidate);
            // Remove the selected candidate from the list
            const indexToRemove = candidates.findIndex(c => c === bestCandidate);
            if (indexToRemove > -1) {
                candidates.splice(indexToRemove, 1);
            }
        } else {
            // Should not happen if candidates are left, but as a safeguard
            break;
        }
    }

    // Sort the final palette by luminance for a pleasant visual order
    return finalPalette.sort((a, b) => {
        const aLuminance = 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
        const bLuminance = 0.2126 * b[0] + 0.7152 * b[1] + 0.0722 * b[2];
        return aLuminance - bLuminance;
    });
}

// --- UI and View Generation ---

/**
 * Converts an RGB color to its hexadecimal representation.
 * @param {number} r - Red value (0-255).
 * @param {number} g - Green value (0-255).
 * @param {number} b - Blue value (0-255).
 * @returns {string} The hex color string (e.g., "#RRGGBB").
 */
function rgbToHex(r, g, b) {
    const toHex = (c) => ('0' + Math.round(c).toString(16)).slice(-2);
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Displays the color palette in the UI.
 * @param {Array<Array<number>>} colors - The array of colors to display.
 */
function displayPalette(colors) {
    colorPaletteContainer.innerHTML = '';
    colors.forEach((color, i) => {
        const colorItem = document.createElement('div');
        colorItem.className = 'color-item';

        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.style.backgroundColor = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;

        const label = document.createElement('span');
        const hexValue = rgbToHex(color[0], color[1], color[2]);
        label.textContent = `${i + 1}`; // Just the number for alignment
        
        const hexLabel = document.createElement('span');
        hexLabel.textContent = hexValue;
        hexLabel.className = 'hex-label';

        // Change order: Number -> Swatch -> Hex
        colorItem.appendChild(label);
        colorItem.appendChild(swatch);
        colorItem.appendChild(hexLabel);
        colorPaletteContainer.appendChild(colorItem);
    });
}

/**
 * Finds the closest color in the palette for a given pixel.
 * @param {Array<number>} pixel - The pixel's color [R, G, B].
 * @param {Array<Array<number>>} colors - The color palette.
 * @returns {Array<number>} The closest color from the palette.
 */
function findClosestColor(pixel, colors) {
    let minDistance = Infinity;
    let closestColor = colors[0];
    for (const color of colors) {
        const distance = euclideanDistance(pixel, color);
        if (distance < minDistance) {
            minDistance = distance;
            closestColor = color;
        }
    }
    return closestColor;
}

/**
 * Applies a 3x3 median filter to the image data to reduce noise and smooth regions.
 * @param {ImageData} imageData - The image data to smooth.
 * @returns {ImageData} The smoothed image data.
 */
function applyMedianFilter(imageData) {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const newImageData = new ImageData(width, height);
    const newData = newImageData.data;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = (y * width + x) * 4;

            // Handle edges by copying the original pixel
            if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
                newData[index] = data[index];
                newData[index + 1] = data[index + 1];
                newData[index + 2] = data[index + 2];
                newData[index + 3] = data[index + 3];
                continue;
            }

            const rValues = [];
            const gValues = [];
            const bValues = [];

            // Iterate over the 3x3 neighborhood
            for (let j = -1; j <= 1; j++) {
                for (let i = -1; i <= 1; i++) {
                    const neighborIndex = ((y + j) * width + (x + i)) * 4;
                    rValues.push(data[neighborIndex]);
                    gValues.push(data[neighborIndex + 1]);
                    bValues.push(data[neighborIndex + 2]);
                }
            }

            // Sort the channel values and find the median (the 5th element in a 3x3 grid)
            rValues.sort((a, b) => a - b);
            gValues.sort((a, b) => a - b);
            bValues.sort((a, b) => a - b);

            newData[index] = rValues[4];
            newData[index + 1] = gValues[4];
            newData[index + 2] = bValues[4];
            newData[index + 3] = 255; // Alpha
        }
    }
    return newImageData;
}

/**
 * Finds the most spacious point within a region to place a label.
 * This works by iteratively "eroding" the outer layer of pixels until a central point or area is found.
 * @param {object} region - The region object, containing an array of pixel indices.
 * @param {number} width - The width of the canvas.
 * @returns {{x: number, y: number}} The coordinates for the best label position.
 */
function findBestLabelPosition(region, width) {
    if (!region || region.pixels.length === 0) return { x: -1, y: -1 };

    let currentPixels = new Set(region.pixels);
    let lastPixels = [];

    while (currentPixels.size > 0) {
        lastPixels = [...currentPixels]; // Save the pixels from this iteration as the potential last set
        const pixelsToRemove = new Set();
        
        for (const pixelIndex of currentPixels) {
            // Check 4-way neighbors
            const neighbors = [
                pixelIndex - 1, 
                pixelIndex + 1,
                pixelIndex - width, 
                pixelIndex + width
            ];

            for (const neighborIndex of neighbors) {
                if (!currentPixels.has(neighborIndex)) {
                    // This pixel is on the boundary of the current set, mark it for removal
                    pixelsToRemove.add(pixelIndex);
                    break; 
                }
            }
        }

        // If all remaining pixels are on the boundary, we've found the center.
        if (pixelsToRemove.size === currentPixels.size) {
            break;
        }
        
        // "Erode" by creating the next set of pixels without the boundary ones.
        const nextPixels = new Set();
        for(const pixelIndex of currentPixels) {
            if (!pixelsToRemove.has(pixelIndex)) {
                nextPixels.add(pixelIndex);
            }
        }
        currentPixels = nextPixels;
    }
    
    // `lastPixels` now holds the centermost pixel(s). Calculate their average position.
    if (lastPixels.length === 0) { 
        // Fallback for an unlikely edge case
        const fallbackIndex = region.pixels[0];
        return { x: fallbackIndex % width, y: Math.floor(fallbackIndex / width) };
    }

    let sumX = 0, sumY = 0;
    for (const pixelIndex of lastPixels) {
        sumX += pixelIndex % width;
        sumY += Math.floor(pixelIndex / width);
    }
    return {
        x: Math.round(sumX / lastPixels.length),
        y: Math.round(sumY / lastPixels.length),
    };
}

/**
 * Generates the Paint-by-Numbers view by segmenting the image based on color similarity.
 * This version uses a region-growing algorithm on the original image for more detailed results.
 * @param {ImageData} originalImageData - The original image data.
 * @param {Array<Array<number>>} colors - The color palette.
 * @returns {{pbn: ImageData, colored: ImageData}} An object containing both the PBN and colored region images.
 */
function generatePbnImage(originalImageData, colors) {
    const width = originalImageData.width;
    const height = originalImageData.height;
    const data = originalImageData.data;

    // Use an offscreen canvas for drawing to easily handle lines and text
    const pbnCanvas = document.createElement('canvas');
    pbnCanvas.width = width;
    pbnCanvas.height = height;
    const pbnCtx = pbnCanvas.getContext('2d');

    // Start with a white background
    pbnCtx.fillStyle = 'white';
    pbnCtx.fillRect(0, 0, width, height);

    // Map each pixel to a region ID. 0 means unvisited.
    const regionMap = new Array(width * height).fill(0);
    let regionId = 1;
    const regions = {}; // Stores info about each region
    const COLOR_THRESHOLD = 12; // Lowered for more detail and accuracy

    // 1. Find regions using a region-growing algorithm (flood-fill with a threshold)
    for (let i = 0; i < regionMap.length; i++) {
        if (regionMap[i] === 0) { // If pixel hasn't been assigned to a region yet
            const startPixelColor = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
            const currentRegion = {
                id: regionId,
                pixels: [],
                sumR: 0, sumG: 0, sumB: 0,
                sumX: 0, sumY: 0,
                minX: width, minY: height,
                maxX: -1, maxY: -1
            };
            regions[regionId] = currentRegion;

            const stack = [i]; // Stack for flood fill
            regionMap[i] = regionId;

            while (stack.length > 0) {
                const pixelIndex = stack.pop();
                const x = pixelIndex % width;
                const y = Math.floor(pixelIndex / width);

                currentRegion.pixels.push(pixelIndex);
                currentRegion.sumR += data[pixelIndex * 4];
                currentRegion.sumG += data[pixelIndex * 4 + 1];
                currentRegion.sumB += data[pixelIndex * 4 + 2];
                currentRegion.sumX += x;
                currentRegion.sumY += y;
                if (x < currentRegion.minX) currentRegion.minX = x;
                if (x > currentRegion.maxX) currentRegion.maxX = x;
                if (y < currentRegion.minY) currentRegion.minY = y;
                if (y > currentRegion.maxY) currentRegion.maxY = y;

                // Check neighbors (N, S, E, W)
                const neighbors = [
                    pixelIndex - width, // N
                    pixelIndex + width, // S
                    pixelIndex - 1,     // W
                    pixelIndex + 1      // E
                ];

                for (const neighborIndex of neighbors) {
                    const nx = neighborIndex % width;
                    const ny = Math.floor(neighborIndex / width);

                    // Ensure neighbor is within canvas bounds and not already visited
                    if (neighborIndex >= 0 && neighborIndex < regionMap.length && regionMap[neighborIndex] === 0) {
                        const isSameRow = ( (neighborIndex === pixelIndex - 1 && y === ny) || (neighborIndex === pixelIndex + 1 && y === ny) );
                        const isVertical = (neighborIndex === pixelIndex - width || neighborIndex === pixelIndex + width);

                        if (isSameRow || isVertical) {
                            const neighborColor = [data[neighborIndex * 4], data[neighborIndex * 4 + 1], data[neighborIndex * 4 + 2]];
                            // Add to region if color is similar to the *starting* pixel of the region
                            if (euclideanDistance(startPixelColor, neighborColor) < COLOR_THRESHOLD) {
                                regionMap[neighborIndex] = regionId;
                                stack.push(neighborIndex);
                            }
                        }
                    }
                }
            }
            regionId++;
        }
    }

    // 2. Calculate initial average color for each region
    for (const id in regions) {
        const region = regions[id];
        if (region.pixels.length > 0) {
            region.avgColor = [
                region.sumR / region.pixels.length,
                region.sumG / region.pixels.length,
                region.sumB / region.pixels.length
            ];
        } else {
            region.avgColor = [0, 0, 0];
        }
    }
    
    // 3. Merge small or very thin regions into their most color-similar neighbors
    const MIN_REGION_SIZE = 150;
    const THINNESS_THRESHOLD = 8; // Aspect ratio threshold (e.g., 8:1) to consider a region "thin"
    const sortedRegionIds = Object.keys(regions).sort((a, b) => regions[a].pixels.length - regions[b].pixels.length);

    for (const regionId of sortedRegionIds) {
        const region = regions[regionId];
        if (!region) continue;

        const regionWidth = region.maxX - region.minX + 1;
        const regionHeight = region.maxY - region.minY + 1;

        // A region should be merged if it's too small OR if it's too thin.
        const isSmall = region.pixels.length < MIN_REGION_SIZE;
        // Avoid division by zero for single-pixel-wide/high regions
        const isThin = (Math.min(regionWidth, regionHeight) > 0 && Math.max(regionWidth, regionHeight) / Math.min(regionWidth, regionHeight) > THINNESS_THRESHOLD);

        if (!isSmall && !isThin) {
            continue;
        }

        const neighborIds = new Set();
        for (const pixelIndex of region.pixels) {
            // Use the image width and height (from the outer scope) for coordinate and neighbor calculations
            const x = pixelIndex % width;
            const y = Math.floor(pixelIndex / width);

            const potentialNeighbors = [];
            if (y > 0) potentialNeighbors.push(pixelIndex - width);
            if (y < height - 1) potentialNeighbors.push(pixelIndex + width);
            if (x > 0) potentialNeighbors.push(pixelIndex - 1);
            if (x < width - 1) potentialNeighbors.push(pixelIndex + 1);

            for (const neighborIndex of potentialNeighbors) {
                const neighborRegionId = regionMap[neighborIndex];
                if (neighborRegionId !== region.id && regions[neighborRegionId]) {
                    neighborIds.add(neighborRegionId);
                }
            }
        }

        if (neighborIds.size === 0) continue;

        // Find the most color-similar neighbor
        let bestNeighborId = -1;
        let minColorDifference = Infinity;
        for (const neighborId of neighborIds) {
            const neighbor = regions[neighborId];
            if (neighbor) {
                const diff = euclideanDistance(region.avgColor, neighbor.avgColor);
                if (diff < minColorDifference) {
                    minColorDifference = diff;
                    bestNeighborId = neighborId;
                }
            }
        }
        
        if (bestNeighborId !== -1) {
            const targetRegion = regions[bestNeighborId];
            
            // Re-assign all pixels in the regionMap
            for (const pixelIndex of region.pixels) {
                regionMap[pixelIndex] = bestNeighborId;
            }

            // Transfer data to the target region and update its averages
            targetRegion.pixels.push(...region.pixels);
            targetRegion.sumR += region.sumR;
            targetRegion.sumG += region.sumG;
            targetRegion.sumB += region.sumB;
            targetRegion.sumX += region.sumX;
            targetRegion.sumY += region.sumY;
            targetRegion.minX = Math.min(targetRegion.minX, region.minX);
            targetRegion.minY = Math.min(targetRegion.minY, region.minY);
            targetRegion.maxX = Math.max(targetRegion.maxX, region.maxX);
            targetRegion.maxY = Math.max(targetRegion.maxY, region.maxY);
            
            // Recalculate average color for the merged region
            targetRegion.avgColor = [
                targetRegion.sumR / targetRegion.pixels.length,
                targetRegion.sumG / targetRegion.pixels.length,
                targetRegion.sumB / targetRegion.pixels.length,
            ];

            delete regions[regionId];
        }
    }

    // 4. Assign a final palette color to each remaining region
    for (const id in regions) {
        const region = regions[id];
        if (region.pixels.length > 0) {
            region.color = findClosestColor(region.avgColor, colors);
        }
    }

    // 5. Create a temporary image with the assigned palette colors.
    const quantizedImageData = new ImageData(width, height);
    for (let i = 0; i < regionMap.length; i++) {
        const regionId = regionMap[i];
        if (regionId > 0 && regions[regionId] && regions[regionId].color) {
            const color = regions[regionId].color;
            quantizedImageData.data[i * 4]     = color[0];
            quantizedImageData.data[i * 4 + 1] = color[1];
            quantizedImageData.data[i * 4 + 2] = color[2];
            quantizedImageData.data[i * 4 + 3] = 255;
        }
    }

    // 6. Apply a smoothing filter to this image to clean up edges.
    const smoothedImageData = applyMedianFilter(quantizedImageData);

    // 7. Re-identify all contiguous regions from the *smoothed* image.
    const finalRegions = {};
    const finalRegionMap = new Array(width * height).fill(0);
    let finalRegionId = 1;
    const smoothedData = smoothedImageData.data;

    for (let i = 0; i < finalRegionMap.length; i++) {
        if (finalRegionMap[i] === 0 && smoothedData[i * 4 + 3] > 0) {
            const color = [smoothedData[i * 4], smoothedData[i * 4 + 1], smoothedData[i * 4 + 2]];
            
            const currentFinalRegion = {
                id: finalRegionId,
                pixels: [],
                color: color,
                sumX: 0, sumY: 0,
            };
            finalRegions[finalRegionId] = currentFinalRegion;

            const stack = [i];
            finalRegionMap[i] = finalRegionId;

            while (stack.length > 0) {
                const pixelIndex = stack.pop();
                currentFinalRegion.pixels.push(pixelIndex);
                currentFinalRegion.sumX += pixelIndex % width;
                currentFinalRegion.sumY += Math.floor(pixelIndex / width);

                const neighbors = [ pixelIndex - width, pixelIndex + width, pixelIndex - 1, pixelIndex + 1 ];
                for (const neighborIndex of neighbors) {
                    const y = Math.floor(pixelIndex / width);
                    const ny = Math.floor(neighborIndex / width);

                    if (neighborIndex >= 0 && neighborIndex < finalRegionMap.length && finalRegionMap[neighborIndex] === 0) {
                        const isSameRow = ((neighborIndex === pixelIndex - 1 && y === ny) || (neighborIndex === pixelIndex + 1 && y === ny));
                        const isVertical = (neighborIndex === pixelIndex - width || neighborIndex === pixelIndex + width);
                        
                        if (isSameRow || isVertical) {
                            const nc = [smoothedData[neighborIndex * 4], smoothedData[neighborIndex * 4 + 1], smoothedData[neighborIndex * 4 + 2]];
                            if (color[0] === nc[0] && color[1] === nc[1] && color[2] === nc[2]) {
                                finalRegionMap[neighborIndex] = finalRegionId;
                                stack.push(neighborIndex);
                            }
                        }
                    }
                }
            }
            finalRegionId++;
        }
    }

    // 8. Final cleanup: Merge any regions that are still too small after smoothing.
    const finalSortedIds = Object.keys(finalRegions).sort((a, b) => finalRegions[a].pixels.length - finalRegions[b].pixels.length);
    for (const regionId of finalSortedIds) {
        const region = finalRegions[regionId];
        if (region && region.pixels.length < MIN_REGION_SIZE) {
            const neighborIds = new Set();
            for (const pixelIndex of region.pixels) {
                const neighbors = [ pixelIndex - width, pixelIndex + width, pixelIndex - 1, pixelIndex + 1 ];
                for (const neighborIndex of neighbors) {
                    if (neighborIndex >= 0 && neighborIndex < finalRegionMap.length) {
                        const neighborRegionId = finalRegionMap[neighborIndex];
                        if (neighborRegionId !== region.id && finalRegions[neighborRegionId]) {
                            neighborIds.add(neighborRegionId);
                        }
                    }
                }
            }

            if (neighborIds.size > 0) {
                let largestNeighborId = -1;
                let maxNeighborSize = -1;
                for (const neighborId of neighborIds) {
                    if (finalRegions[neighborId].pixels.length > maxNeighborSize) {
                        maxNeighborSize = finalRegions[neighborId].pixels.length;
                        largestNeighborId = neighborId;
                    }
                }

                if (largestNeighborId !== -1) {
                    const targetRegion = finalRegions[largestNeighborId];
                    for (const pixelIndex of region.pixels) {
                        finalRegionMap[pixelIndex] = largestNeighborId;
                    }
                    targetRegion.pixels.push(...region.pixels);
                    delete finalRegions[regionId];
                }
            }
        }
    }

    // 9. Draw the final edges based on the cleaned-up region map.
    pbnCtx.strokeStyle = 'black';
    pbnCtx.lineWidth = 0.5;
    pbnCtx.beginPath();
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = y * width + x;
            const currentRegionId = finalRegionMap[index];

            if (x < width - 1) {
                if (finalRegionMap[index + 1] !== currentRegionId) {
                    pbnCtx.moveTo(x + 1, y);
                    pbnCtx.lineTo(x + 1, y + 1);
                }
            }
            if (y < height - 1) {
                if (finalRegionMap[index + width] !== currentRegionId) {
                    pbnCtx.moveTo(x, y + 1);
                    pbnCtx.lineTo(x + 1, y + 1);
                }
            }
        }
    }
    pbnCtx.stroke();

    // 10. Draw color numbers in the center of the final, valid regions.
    pbnCtx.fillStyle = 'black';
    pbnCtx.textAlign = 'center';
    pbnCtx.textBaseline = 'middle';
    
    for (const id in finalRegions) {
        const region = finalRegions[id];
        if (!region || region.pixels.length === 0) continue;
        
        const { x: labelX, y: labelY } = findBestLabelPosition(region, width);
        
        const colorIndex = colors.findIndex(c => c[0] === region.color[0] && c[1] === region.color[1] && c[2] === region.color[2]);

        if (colorIndex !== -1) {
            const fontSize = 8;
            pbnCtx.font = `${fontSize}px Arial`;
            pbnCtx.fillText(colorIndex + 1, labelX, labelY);
        }
    }

    // 11. Create the final colored regions preview image.
    const coloredImageData = new ImageData(width, height);
    const coloredData = coloredImageData.data;
    for (let i = 0; i < finalRegionMap.length; i++) {
        const regionId = finalRegionMap[i];
        if (regionId > 0 && finalRegions[regionId]) {
            const color = finalRegions[regionId].color;
            coloredData[i * 4] = color[0];
            coloredData[i * 4 + 1] = color[1];
            coloredData[i * 4 + 2] = color[2];
            coloredData[i * 4 + 3] = 255;
        }
    }

    return {
        pbn: pbnCtx.getImageData(0, 0, width, height),
        colored: coloredImageData
    };
}

/**
 * Switches the main canvas view between 'original', 'quantized', and 'pbn'.
 * @param {string} view - The view to display.
 */
function switchView(view) {
    currentView = view;
    document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));

    if (view === 'original') {
        if (originalImage) ctx.drawImage(originalImage, 0, 0);
        originalViewBtn.classList.add('active');
    } else if (view === 'quantized') {
        if (coloredRegionsImageData) ctx.putImageData(coloredRegionsImageData, 0, 0);
        quantizedViewBtn.classList.add('active');
    } else if (view === 'pbn') {
        if (pbnImageData) ctx.putImageData(pbnImageData, 0, 0);
        pbnViewBtn.classList.add('active');
    }
} 