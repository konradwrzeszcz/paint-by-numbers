// --- Worker Self-Contained Logic ---

self.onmessage = (event) => {
    try {
        const { imageData, options, k } = event.data;

        const allPixels = getPixels(imageData);
        const pixelSample = samplePixels(allPixels, 30000);

        const initialK = Math.min(k * 5, 50);
        const kmeansResult = kmeans(pixelSample, initialK);
        const dominantColors = generateOptimalPalette(kmeansResult.centroids, kmeansResult.clusters, k);

        const results = generatePbnImage(imageData, dominantColors, options);

        // Post results back to the main thread
        self.postMessage({
            type: 'success',
            dominantColors: dominantColors,
            pbnImageData: results.pbn,
            coloredRegionsImageData: results.colored
        });
    } catch (error) {
        self.postMessage({
            type: 'error',
            message: error.message,
            stack: error.stack
        });
    }
};

// --- All processing functions moved from script.js ---

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

function euclideanDistance(p1, p2) {
    return Math.sqrt(
        Math.pow(p1[0] - p2[0], 2) +
        Math.pow(p1[1] - p2[1], 2) +
        Math.pow(p1[2] - p2[2], 2)
    );
}

function kmeans(pixels, k) {
    let centroids = [];
    const usedIndices = new Set();
    while(centroids.length < k && centroids.length < pixels.length) {
        const index = Math.floor(Math.random() * pixels.length);
        if (!usedIndices.has(index)) {
            centroids.push(pixels[index]);
            usedIndices.add(index);
        }
    }

    let iterations = 0;
    const maxIterations = 30;
    let lastCentroids;
    let clusters;

    while (iterations < maxIterations) {
        clusters = Array.from({ length: k }, () => []);
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

        let newCentroids = [];
        for (let i = 0; i < k; i++) {
            if (clusters[i].length > 0) {
                const mean = clusters[i].reduce((acc, pixel) => {
                    return [acc[0] + pixel[0], acc[1] + pixel[1], acc[2] + pixel[2]];
                }, [0, 0, 0]).map(val => Math.round(val / clusters[i].length));
                newCentroids.push(mean);
            } else {
                newCentroids.push(pixels[Math.floor(Math.random() * pixels.length)]);
            }
        }
        
        lastCentroids = centroids;
        centroids = newCentroids;

        let converged = true;
        if (!lastCentroids) converged = false;
        else {
            for (let i = 0; i < k; i++) {
                if (!lastCentroids[i] || euclideanDistance(lastCentroids[i], centroids[i]) > 1) {
                    converged = false;
                    break;
                }
            }
        }
        if (converged) break;
        iterations++;
    }
    return { centroids, clusters };
}

function generateOptimalPalette(centroids, clusters, k) {
    if (centroids.length <= k) {
        return centroids.sort((a, b) => {
            const aLuminance = 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
            const bLuminance = 0.2126 * b[0] + 0.7152 * b[1] + 0.0722 * b[2];
            return aLuminance - bLuminance;
        });
    }

    const weightedCentroids = centroids.map((centroid, i) => ({
        color: centroid,
        size: clusters[i] ? clusters[i].length : 0
    })).filter(c => c.size > 0);

    weightedCentroids.sort((a, b) => b.size - a.size);

    const finalPalette = [];
    const candidates = weightedCentroids.map(c => c.color);

    if (candidates.length > 0) {
        finalPalette.push(candidates.shift());
    }

    while (finalPalette.length < k && candidates.length > 0) {
        let bestCandidate = null;
        let maxMinDistance = -1;
        for (const candidate of candidates) {
            let minDistanceToPalette = Infinity;
            for (const color of finalPalette) {
                minDistanceToPalette = Math.min(minDistanceToPalette, euclideanDistance(candidate, color));
            }
            if (minDistanceToPalette > maxMinDistance) {
                maxMinDistance = minDistanceToPalette;
                bestCandidate = candidate;
            }
        }
        
        if (bestCandidate) {
            finalPalette.push(bestCandidate);
            const indexToRemove = candidates.findIndex(c => c === bestCandidate);
            if (indexToRemove > -1) {
                candidates.splice(indexToRemove, 1);
            }
        } else {
            break;
        }
    }

    return finalPalette.sort((a, b) => {
        const aLuminance = 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
        const bLuminance = 0.2126 * b[0] + 0.7152 * b[1] + 0.0722 * b[2];
        return aLuminance - bLuminance;
    });
}

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

function applyMedianFilter(imageData) {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const newImageData = new ImageData(width, height);
    const newData = newImageData.data;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = (y * width + x) * 4;
            if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
                newData[index] = data[index];
                newData[index + 1] = data[index + 1];
                newData[index + 2] = data[index + 2];
                newData[index + 3] = data[index + 3];
                continue;
            }
            const rValues = [], gValues = [], bValues = [];
            for (let j = -1; j <= 1; j++) {
                for (let i = -1; i <= 1; i++) {
                    const neighborIndex = ((y + j) * width + (x + i)) * 4;
                    rValues.push(data[neighborIndex]);
                    gValues.push(data[neighborIndex + 1]);
                    bValues.push(data[neighborIndex + 2]);
                }
            }
            rValues.sort((a, b) => a - b);
            gValues.sort((a, b) => a - b);
            bValues.sort((a, b) => a - b);
            newData[index] = rValues[4];
            newData[index + 1] = gValues[4];
            newData[index + 2] = bValues[4];
            newData[index + 3] = 255;
        }
    }
    return newImageData;
}

function findBestLabelPosition(region, width) {
    if (!region || region.pixels.length === 0) return { x: -1, y: -1 };
    let currentPixels = new Set(region.pixels);
    let lastPixels = [];
    while (currentPixels.size > 0) {
        lastPixels = [...currentPixels];
        const pixelsToRemove = new Set();
        for (const pixelIndex of currentPixels) {
            const neighbors = [pixelIndex - 1, pixelIndex + 1, pixelIndex - width, pixelIndex + width];
            for (const neighborIndex of neighbors) {
                if (!currentPixels.has(neighborIndex)) {
                    pixelsToRemove.add(pixelIndex);
                    break; 
                }
            }
        }
        if (pixelsToRemove.size === currentPixels.size) break;
        const nextPixels = new Set();
        for(const pixelIndex of currentPixels) {
            if (!pixelsToRemove.has(pixelIndex)) nextPixels.add(pixelIndex);
        }
        currentPixels = nextPixels;
    }
    if (lastPixels.length === 0) {
        const fallbackIndex = region.pixels[0];
        return { x: fallbackIndex % width, y: Math.floor(fallbackIndex / width) };
    }
    let sumX = 0, sumY = 0;
    for (const pixelIndex of lastPixels) {
        sumX += pixelIndex % width;
        sumY += Math.floor(pixelIndex / width);
    }
    return { x: Math.round(sumX / lastPixels.length), y: Math.round(sumY / lastPixels.length) };
}

/**
 * Generates the Paint-by-Numbers view by segmenting the image based on color similarity.
 * This version uses a region-growing algorithm on the original image for more detailed results.
 * @param {ImageData} originalImageData - The original image data.
 * @param {Array<Array<number>>} colors - The color palette.
 * @param {object} options - An object with processing parameters.
 * @returns {{pbn: ImageData, colored: ImageData}} An object containing both the PBN and colored region images.
 */
function generatePbnImage(originalImageData, colors, options) {
    const width = originalImageData.width;
    const height = originalImageData.height;
    const data = originalImageData.data;
    const { colorThreshold, minRegionSize, thinnessThreshold } = options;

    // --- 1. Initial Detailed Region Finding ---
    // This pass creates detailed regions based on the original image's colors.
    const initialRegionMap = new Array(width * height).fill(0);
    const initialRegions = {};
    let regionId = 1;
    for (let i = 0; i < initialRegionMap.length; i++) {
        if (initialRegionMap[i] === 0) {
            const startPixelColor = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
            const currentRegion = { id: regionId, pixels: [], sumR: 0, sumG: 0, sumB: 0, minX: width, minY: height, maxX: -1, maxY: -1 };
            initialRegions[regionId] = currentRegion;
            const stack = [i];
            initialRegionMap[i] = regionId;
            while (stack.length > 0) {
                const pixelIndex = stack.pop();
                currentRegion.pixels.push(pixelIndex);
                currentRegion.sumR += data[pixelIndex * 4];
                currentRegion.sumG += data[pixelIndex * 4 + 1];
                currentRegion.sumB += data[pixelIndex * 4 + 2];
                const x = pixelIndex % width;
                const y = Math.floor(pixelIndex / width);
                if (x < currentRegion.minX) currentRegion.minX = x;
                if (x > currentRegion.maxX) currentRegion.maxX = x;
                if (y < currentRegion.minY) currentRegion.minY = y;
                if (y > currentRegion.maxY) currentRegion.maxY = y;
                
                const neighbors = [pixelIndex - width, pixelIndex + width, pixelIndex - 1, pixelIndex + 1];
                for (const neighborIndex of neighbors) {
                    if (neighborIndex >= 0 && neighborIndex < initialRegionMap.length && initialRegionMap[neighborIndex] === 0) {
                        const isSameRow = ( (neighborIndex % width) === x || (Math.floor(neighborIndex / width)) === y );
                        if (isSameRow) {
                            const neighborColor = [data[neighborIndex * 4], data[neighborIndex * 4 + 1], data[neighborIndex * 4 + 2]];
                            if (euclideanDistance(startPixelColor, neighborColor) < colorThreshold) {
                                initialRegionMap[neighborIndex] = regionId;
                                stack.push(neighborIndex);
                            }
                        }
                    }
                }
            }
            regionId++;
        }
    }

    // --- 2. Calculate Averages & Assign Palette Colors ---
    for (const id in initialRegions) {
        const region = initialRegions[id];
        if (region.pixels.length > 0) {
            const avgColor = [region.sumR / region.pixels.length, region.sumG / region.pixels.length, region.sumB / region.pixels.length];
            region.color = findClosestColor(avgColor, colors);
        } else {
            delete initialRegions[id]; // Remove empty regions
        }
    }

    // --- 3. Merge Regions based on Size, Shape, and Final Color ---
    const sortedRegionIds = Object.keys(initialRegions).sort((a, b) => initialRegions[a].pixels.length - initialRegions[b].pixels.length);
    for (const id of sortedRegionIds) {
        const region = initialRegions[id];
        if (!region) continue;

        const regionWidth = region.maxX - region.minX + 1;
        const regionHeight = region.maxY - region.minY + 1;
        const isSmall = region.pixels.length < minRegionSize;
        const isThin = (Math.min(regionWidth, regionHeight) > 0 && Math.max(width, height) / Math.min(width, height) > thinnessThreshold);

        if (!isSmall && !isThin) continue;

        let bestNeighborId = -1;
        const neighborIds = new Set();
        for (const pixelIndex of region.pixels) {
            const neighbors = [pixelIndex - width, pixelIndex + width, pixelIndex - 1, pixelIndex + 1];
            for (const neighborIndex of neighbors) {
                if (neighborIndex >= 0 && neighborIndex < initialRegionMap.length) {
                    const neighborId = initialRegionMap[neighborIndex];
                    if (neighborId !== region.id && initialRegions[neighborId]) {
                        neighborIds.add(neighborId);
                    }
                }
            }
        }

        if (neighborIds.size > 0) {
            let minDiff = Infinity;
            for (const neighborId of neighborIds) {
                const neighbor = initialRegions[neighborId];
                if (neighbor.color === region.color) { // Prioritize merging with same-color neighbors
                    bestNeighborId = neighborId;
                    break;
                }
                const diff = euclideanDistance(region.color, neighbor.color);
                if (diff < minDiff) {
                    minDiff = diff;
                    bestNeighborId = neighborId;
                }
            }
        }
        
        if (bestNeighborId !== -1) {
            const targetRegion = initialRegions[bestNeighborId];
            for (const pixelIndex of region.pixels) {
                initialRegionMap[pixelIndex] = bestNeighborId;
            }
            targetRegion.pixels.push(...region.pixels);
            // Update bounds, no need to recalc average color as we merge based on final palette color
            targetRegion.minX = Math.min(targetRegion.minX, region.minX);
            targetRegion.minY = Math.min(targetRegion.minY, region.minY);
            targetRegion.maxX = Math.max(targetRegion.maxX, region.maxX);
            targetRegion.maxY = Math.max(targetRegion.maxY, region.maxY);
            delete initialRegions[id];
        }
    }

    // --- 4. Draw PBN Canvas ---
    const pbnCanvas = new OffscreenCanvas(width, height);
    const pbnCtx = pbnCanvas.getContext('2d');
    pbnCtx.fillStyle = 'white';
    pbnCtx.fillRect(0, 0, width, height);

    // Draw Edges
    pbnCtx.strokeStyle = 'black';
    pbnCtx.lineWidth = 0.5;
    pbnCtx.beginPath();
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = y * width + x;
            const currentRegionId = initialRegionMap[index];
            if (x < width - 1 && initialRegionMap[index + 1] !== currentRegionId) {
                pbnCtx.moveTo(x + 1, y);
                pbnCtx.lineTo(x + 1, y + 1);
            }
            if (y < height - 1 && initialRegionMap[index + width] !== currentRegionId) {
                pbnCtx.moveTo(x, y + 1);
                pbnCtx.lineTo(x + 1, y + 1);
            }
        }
    }
    pbnCtx.stroke();

    // Draw Numbers
    pbnCtx.fillStyle = 'black';
    pbnCtx.textAlign = 'center';
    pbnCtx.textBaseline = 'middle';
    for (const id in initialRegions) {
        const region = initialRegions[id];
        if (!region || region.pixels.length < minRegionSize) continue;
        const { x: labelX, y: labelY } = findBestLabelPosition(region, width);
        const colorIndex = colors.findIndex(c => c === region.color);
        if (colorIndex !== -1) {
            const fontSize = 8;
            pbnCtx.font = `${fontSize}px Arial`;
            pbnCtx.fillText(colorIndex + 1, labelX, labelY);
        }
    }
    
    // --- 5. Create Final Colored Image ---
    const coloredImageData = new ImageData(width, height);
    for (let i = 0; i < initialRegionMap.length; i++) {
        const regionId = initialRegionMap[i];
        if (regionId > 0 && initialRegions[regionId]) {
            const color = initialRegions[regionId].color;
            coloredImageData.data[i * 4]     = color[0];
            coloredImageData.data[i * 4 + 1] = color[1];
            coloredImageData.data[i * 4 + 2] = color[2];
            coloredImageData.data[i * 4 + 3] = 255;
        }
    }
    
    return {
        pbn: pbnCtx.getImageData(0, 0, width, height),
        colored: coloredImageData
    };
} 