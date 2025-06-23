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

    const k = parseInt(colorCountInput.value, 10);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const allPixels = getPixels(imageData);

    // Optimization: Use a sample of pixels for k-means
    const pixelSample = samplePixels(allPixels, 30000); 

    dominantColors = kmeans(pixelSample, k);
    displayPalette(dominantColors);

    quantizedImageData = generateQuantizedImage(imageData, dominantColors);
    
    // Apply a smoothing filter to the quantized image to reduce jagged edges.
    const smoothedImageData = applyMedianFilter(quantizedImageData);

    const results = generatePbnImage(smoothedImageData, dominantColors);
    pbnImageData = results.pbn;
    coloredRegionsImageData = results.colored;
    
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
 * @returns {Array<Array<number>>} An array of the dominant colors.
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

    while (iterations < maxIterations) {
        // 2. Create clusters
        let clusters = Array.from({ length: k }, () => []);

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

    return centroids;
}

// --- UI and View Generation ---

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
        label.textContent = `${i + 1}`;

        colorItem.appendChild(swatch);
        colorItem.appendChild(label);
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
 * Creates a new image where each pixel is replaced by the closest color from the palette.
 * @param {ImageData} imageData - The original image data.
 * @param {Array<Array<number>>} colors - The generated color palette.
 * @returns {ImageData} The new image data for the quantized view.
 */
function generateQuantizedImage(imageData, colors) {
    const newImageData = new ImageData(imageData.width, imageData.height);
    const data = imageData.data;
    const newData = newImageData.data;

    for (let i = 0; i < data.length; i += 4) {
        const pixel = [data[i], data[i+1], data[i+2]];
        const closestColor = findClosestColor(pixel, colors);
        newData[i] = closestColor[0];
        newData[i+1] = closestColor[1];
        newData[i+2] = closestColor[2];
        newData[i+3] = 255; // Alpha
    }
    return newImageData;
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
 * Generates the Paint-by-Numbers view, including outlines and color numbers.
 * @param {ImageData} quantizedImageData - The image data after color quantization.
 * @param {Array<Array<number>>} colors - The color palette.
 * @returns {{pbn: ImageData, colored: ImageData}} An object containing both the PBN and colored region images.
 */
function generatePbnImage(quantizedImageData, colors) {
    const width = quantizedImageData.width;
    const height = quantizedImageData.height;

    // Use an offscreen canvas for drawing to easily handle lines and text
    const pbnCanvas = document.createElement('canvas');
    pbnCanvas.width = width;
    pbnCanvas.height = height;
    const pbnCtx = pbnCanvas.getContext('2d');

    // Start with a white background
    pbnCtx.fillStyle = 'white';
    pbnCtx.fillRect(0, 0, width, height);

    const data = quantizedImageData.data;
    // Map each pixel to a region ID. 0 means unvisited.
    const regionMap = new Array(data.length / 4).fill(0);
    let regionId = 1;
    const regions = {}; // Stores info about each region: { id, pixels, color, centroid }

    // 1. Find all contiguous color regions using a flood-fill based approach
    for (let i = 0; i < regionMap.length; i++) {
        if (regionMap[i] === 0) { // If pixel hasn't been assigned to a region yet
            const color = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
            const currentRegion = {
                id: regionId,
                pixels: [],
                color: color,
                sumX: 0,
                sumY: 0,
                minX: width,
                minY: height,
                maxX: -1,
                maxY: -1
            };
            regions[regionId] = currentRegion;

            const stack = [i]; // Stack for flood fill
            regionMap[i] = regionId;

            while (stack.length > 0) {
                const pixelIndex = stack.pop();
                currentRegion.pixels.push(pixelIndex);
                
                const x = pixelIndex % width;
                const y = Math.floor(pixelIndex / width);
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
                        // Check for same-row continuity for W/E neighbors
                        const isSameRow = ( (neighborIndex === pixelIndex - 1 && y === ny) || (neighborIndex === pixelIndex + 1 && y === ny) );
                        const isVertical = (neighborIndex === pixelIndex - width || neighborIndex === pixelIndex + width);

                        if (isSameRow || isVertical) {
                            const neighborColor = [data[neighborIndex * 4], data[neighborIndex * 4 + 1], data[neighborIndex * 4 + 2]];
                            if (color[0] === neighborColor[0] && color[1] === neighborColor[1] && color[2] === neighborColor[2]) {
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

    // NEW: Merge small regions into their largest neighbors
    const MIN_REGION_SIZE = 100; // Regions smaller than this will be merged
    const sortedRegionIds = Object.keys(regions).sort((a, b) => regions[a].pixels.length - regions[b].pixels.length);

    for (const regionId of sortedRegionIds) {
        const region = regions[regionId];

        // If region is gone or big enough, skip
        if (!region || region.pixels.length >= MIN_REGION_SIZE) {
            continue;
        }

        // Find all unique neighbors
        const neighborIds = new Set();
        for (const pixelIndex of region.pixels) {
            const x = pixelIndex % width;
            const y = Math.floor(pixelIndex / width);
            const potentialNeighbors = [];
            if (y > 0) potentialNeighbors.push(pixelIndex - width); // N
            if (y < height - 1) potentialNeighbors.push(pixelIndex + width); // S
            if (x > 0) potentialNeighbors.push(pixelIndex - 1); // W
            if (x < width - 1) potentialNeighbors.push(pixelIndex + 1); // E

            for (const neighborIndex of potentialNeighbors) {
                const neighborRegionId = regionMap[neighborIndex];
                if (neighborRegionId !== region.id && regions[neighborRegionId]) {
                    neighborIds.add(neighborRegionId);
                }
            }
        }

        if (neighborIds.size === 0) continue; // Isolated, cannot merge

        // Find the largest neighbor among the candidates
        let largestNeighborId = -1;
        let maxNeighborSize = -1;
        for (const neighborId of neighborIds) {
            const neighbor = regions[neighborId];
            if (neighbor && neighbor.pixels.length > maxNeighborSize) {
                maxNeighborSize = neighbor.pixels.length;
                largestNeighborId = neighborId;
            }
        }
        
        // Merge the small region into the largest one found
        if (largestNeighborId !== -1) {
            const targetRegion = regions[largestNeighborId];
            
            // Re-assign all pixels in the regionMap
            for (const pixelIndex of region.pixels) {
                regionMap[pixelIndex] = largestNeighborId;
            }

            // Transfer pixel data to the target region
            targetRegion.pixels.push(...region.pixels);
            targetRegion.sumX += region.sumX;
            targetRegion.sumY += region.sumY;
            targetRegion.minX = Math.min(targetRegion.minX, region.minX);
            targetRegion.minY = Math.min(targetRegion.minY, region.minY);
            targetRegion.maxX = Math.max(targetRegion.maxX, region.maxX);
            targetRegion.maxY = Math.max(targetRegion.maxY, region.maxY);

            // Delete the old, small region
            delete regions[regionId];
        }
    }

    // 2. Draw edges and calculate centroids
    pbnCtx.strokeStyle = 'black';
    pbnCtx.lineWidth = 0.5;
    pbnCtx.beginPath();
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = y * width + x;
            const currentRegionId = regionMap[index];

            // Check right neighbor
            if (x < width - 1) {
                if (regionMap[index + 1] !== currentRegionId) {
                    pbnCtx.moveTo(x + 1, y);
                    pbnCtx.lineTo(x + 1, y + 1);
                }
            }
            // Check bottom neighbor
            if (y < height - 1) {
                if (regionMap[index + width] !== currentRegionId) {
                    pbnCtx.moveTo(x, y + 1);
                    pbnCtx.lineTo(x + 1, y + 1);
                }
            }
        }
    }
    pbnCtx.stroke();


    // 3. Draw color numbers at the center of each region
    pbnCtx.fillStyle = 'black';
    pbnCtx.textAlign = 'center';
    pbnCtx.textBaseline = 'middle';
    
    for (const id in regions) {
        const region = regions[id];
        if (region.pixels.length === 0) continue;
        
        let labelX = Math.round(region.sumX / region.pixels.length);
        let labelY = Math.round(region.sumY / region.pixels.length);

        // Check if the calculated centroid is actually inside the region.
        const centroidIndex = labelY * width + labelX;
        if (regionMap[centroidIndex] !== region.id) {
            // The centroid is outside. As a fallback, find the pixel within the region
            // that is closest to the center of the region's bounding box. This is more
            // robust for C-shaped or other non-convex regions.
            const centerX = (region.minX + region.maxX) / 2;
            const centerY = (region.minY + region.maxY) / 2;

            let minDistanceSq = Infinity;
            for (const pixelIndex of region.pixels) {
                const px = pixelIndex % width;
                const py = Math.floor(pixelIndex / width);
                const distSq = Math.pow(px - centerX, 2) + Math.pow(py - centerY, 2);

                if (distSq < minDistanceSq) {
                    minDistanceSq = distSq;
                    labelX = px;
                    labelY = py;
                }
            }
        }
        
        // Find the color number (1-based index)
        const colorIndex = colors.findIndex(c => c[0] === region.color[0] && c[1] === region.color[1] && c[2] === region.color[2]);

        // Only draw numbers for reasonably sized regions to avoid clutter
        if (colorIndex !== -1 && region.pixels.length > 20) {
            // Use a fixed small font size for consistency
            const fontSize = 8;
            pbnCtx.font = `${fontSize}px Arial`;
            pbnCtx.fillText(colorIndex + 1, labelX, labelY);
        }
    }

    // 4. Create the final colored regions preview image from the processed region map.
    const coloredImageData = new ImageData(width, height);
    const coloredData = coloredImageData.data;
    for (let i = 0; i < regionMap.length; i++) {
        const regionId = regionMap[i];
        if (regionId > 0) {
            const color = regions[regionId].color;
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