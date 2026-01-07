/**
 * Media extraction logic (images, videos, etc.)
 */

/**
 * Extract media content from the page
 */
export async function extractMedia(page, options = {}) {
  const media = await page.evaluate((opts) => {
    const result = {
      images: [],
      videos: [],
    };

    // Extract images
    if (opts.includeImages) {
      document.querySelectorAll("img").forEach((img, index) => {
        const src = img.src || img.dataset.src || img.dataset.lazySrc;

        if (src && !src.startsWith("data:") && src.length > 10) {
          result.images.push({
            index,
            src,
            alt: img.alt || "",
            title: img.title || "",
            width: img.naturalWidth || img.width || null,
            height: img.naturalHeight || img.height || null,
            loading: img.loading || "eager",
          });
        }
      });

      // Also get background images
      document
        .querySelectorAll('[style*="background-image"]')
        .forEach((el, index) => {
          const style = el.getAttribute("style");
          const match = style.match(/url\(['"]?(.*?)['"]?\)/);
          if (match && match[1]) {
            result.images.push({
              index: result.images.length,
              src: match[1],
              alt: "",
              title: "",
              type: "background",
            });
          }
        });
    }

    // Extract videos
    document
      .querySelectorAll('video, iframe[src*="youtube"], iframe[src*="vimeo"]')
      .forEach((video, index) => {
        if (video.tagName === "VIDEO") {
          result.videos.push({
            index,
            type: "html5",
            src: video.src || video.querySelector("source")?.src || null,
            poster: video.poster || null,
            duration: video.duration || null,
          });
        } else {
          result.videos.push({
            index,
            type: "embed",
            src: video.src,
            platform: video.src.includes("youtube") ? "youtube" : "vimeo",
          });
        }
      });

    return result;
  }, options);

  return media;
}
