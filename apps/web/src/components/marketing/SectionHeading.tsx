interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
}: SectionHeadingProps) {
  return (
    <div className={align === "center" ? "text-center" : "text-left"}>
      {eyebrow && (
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">{eyebrow}</p>
      )}
      <h2 className="mt-2 font-display text-2xl font-bold text-text sm:text-3xl">{title}</h2>
      {description && (
        <p
          className={`mt-3 text-text-muted ${align === "center" ? "mx-auto max-w-2xl" : "max-w-2xl"}`}
        >
          {description}
        </p>
      )}
    </div>
  );
}
