# Paint by Numbers Image Generator

This application allows users to upload an image and convert it into a "paint by numbers" canvas. The user can specify how many colors to use, and the app will automatically generate a color palette from the most frequent colors in the image. It provides different views: the original image, a color-segmented version, and the final paint-by-numbers outline with color-coded numbers.

## Task status

- [ done ] Project Setup
  - [ done ] Create `TASK.md`
  - [ done ] Create `index.html`
  - [ done ] Create `style.css`
  - [ done ] Create `script.js`
- [ done ] UI Layout
  - [ done ] Add header with color number input
  - [ done ] Add image upload button
  - [ done ] Add canvas for image display
  - [ done ] Add view toggle controls
  - [ done ] Add container for color palette
- [ done ] Image Handling
  - [ done ] Implement image upload and display on canvas
- [ done ] Color Processing
  - [ done ] Implement color quantization (e.g., k-means)
  - [ done ] Extract dominant colors
  - [ done ] Display the generated color palette
- [ done ] Image Segmentation & Rendering
  - [ done ] Generate color-quantized image view
  - [ done ] Identify color regions
  - [ done ] Implement edge detection
  - [ done ] Calculate region centers
  - [ done ] Render the paint-by-numbers view
- [ done ] UI Interactivity
  - [ done ] Link color input to processing logic
  - [ done ] Implement view toggle functionality
- [ done ] Final Touches
  - [ done ] Add CSS styling
  - [ done ] Code cleanup and refactoring

## Implementation plan

1.  **Project Setup** - Initialize the project structure.
    a. Create `TASK.md` - This file, for tracking progress.
    b. Create `index.html` - The main HTML file for the application.
    c. Create `style.css` - For styling the application.
    d. Create `script.js` - For the application's logic.
2.  **UI Layout** - Create the basic user interface in `index.html`.
    a. Add a header containing the title and a number input for selecting the number of colors.
    b. Add a file input button for uploading images.
    c. Add a `<canvas>` element to display and manipulate the image.
    d. Add toggle buttons or a radio group to switch between the three views (Original, Quantized, Paint-by-Numbers).
    e. Add a `<div>` to later display the list of colors and their numbers.
3.  **Image Handling** - Implement the initial image loading.
    a. Write JavaScript to handle the file input's `change` event, load the selected image, and draw it onto the canvas.
4.  **Color Processing** - This is the core logic for palette generation.
    a. Implement a color quantization algorithm. A k-means clustering algorithm is a good choice for grouping pixel colors.
    b. Based on the user's input for the number of colors, run the algorithm on the image's pixel data to find the dominant color centroids.
    c. Create a UI component to display the resulting color palette, showing a swatch of each color next to its assigned number (1, 2, 3, etc.).
5.  **Image Segmentation & Rendering** - Generate the different image views.
    a. Create the quantized view by replacing each pixel's color in the original image with the closest color from the generated palette.
    b. Implement an algorithm (like connected-component labeling or flood fill) to identify contiguous regions of the same color in the quantized image.
    c. Implement an edge detection algorithm to find the borders of these regions. A simple way is to check each pixel's neighbors; if a neighbor has a different color, it's an edge.
    d. For each region, calculate a central point (e.g., the centroid).
    e. Render the final "paint by numbers" view: a white background with black outlines for all regions and the corresponding color number drawn in the center of each region.
6.  **UI Interactivity** - Make the UI functional.
    a. Connect the number of colors input so that changing its value triggers the image reprocessing.
    b. Implement the view toggle buttons to switch the canvas content between the original image, the quantized image, and the paint-by-numbers view.
7.  **Final Touches** - Polish the application.
    a. Apply CSS to create a clean, user-friendly layout.
    b. Review the code for clarity, performance, and potential improvements.

## All relevant files

**Project Setup:**
+   `TASK.md`
+   `index.html`
+   `style.css`
+   `script.js`

**UI Layout & Image Handling:**
+/- `index.html`
+/- `style.css`
+/- `script.js`

**Color Processing, Segmentation & UI Interactivity**
+/- `script.js`

(Other sections will be filled as tasks are completed) 