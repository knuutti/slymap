# Map Preview Images

This directory contains preview images for each map shown on the main page.

## Image Specifications

- **Format**: JPG or PNG (JPG recommended for smaller file sizes)
- **Dimensions**: Recommended 400x300 pixels or higher (16:9 or 4:3 aspect ratio)
- **Quality**: High quality ground-level screenshots from each map area
- **Style**: In-game screenshots showing the map environment from ground level

## Required Images

1. **S2E1-preview.jpg** - Paris Hub (Episode 1 - The Black Chateau)
2. **S2E2-preview.jpg** - India Hub (Episode 2 - A Tangled Web)  
3. **S2E4-preview.jpg** - Prague Hub (Episode 4 - Jailbreak)
4. **S2E6-preview.jpg** - Canada Hub (Episode 6 - Menace from the North, Eh!)
5. **sailing-preview.jpg** - Sailing Map (Cooper Gang Sailing Adventure)

## Image Guidelines

- Use iconic or recognizable views from each map
- Ensure good lighting and visibility
- Avoid UI elements if possible
- Capture the atmosphere and theme of each location
- Consider scenic or landmark views that represent each map well

## Fallback Behavior

If an image is not found, the system will:
1. Hide the broken image
2. Show a map emoji (🗺️) as a placeholder
3. Maintain the gradient background
4. Display all other card information normally

## Technical Notes

- Images are displayed with `object-fit: cover` to maintain aspect ratio
- Hover effects include a subtle zoom (1.05x scale)
- Images are optimized for web display
- Error handling prevents broken image icons from showing