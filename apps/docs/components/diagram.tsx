/**
 * Diagram component that auto-inverts in dark mode.
 * Generate light-theme images only. Dark mode handled via CSS filter.
 *
 * Usage in MDX:
 *   <Diagram src="/images/architecture.png" alt="Architecture overview" />
 */
export function Diagram({ src, alt, caption }: { src: string; alt: string; caption?: string }) {
  return (
    <figure className="my-8">
      <img
        src={src}
        alt={alt}
        className="w-full rounded-lg border border-fd-border dark:invert dark:hue-rotate-180"
      />
      {caption && (
        <figcaption className="mt-2 text-center text-sm text-fd-muted-foreground">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
