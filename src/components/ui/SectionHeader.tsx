import { ButtonLink } from "./Button";

/**
 * A section's eyebrow, heading, subtitle and optional "see all" link. The
 * heading carries `id` so the section can use aria-labelledby.
 */
export function SectionHeader({
  title,
  eyebrow,
  subtitle,
  action,
  headingLevel = 2,
  id,
}: {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  action?: { href: string; label: string };
  headingLevel?: 2 | 3;
  id?: string;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
      <div className="flex flex-col gap-1">
        {eyebrow && <p className="text-accent-strong text-sm font-semibold">{eyebrow}</p>}
        <Heading
          id={id}
          className="text-ink text-xl leading-7 font-semibold lg:text-2xl lg:leading-8"
        >
          {title}
        </Heading>
        {subtitle && <p className="text-ink-2 text-base">{subtitle}</p>}
      </div>
      {action && (
        <ButtonLink href={action.href} variant="link" className="shrink-0 self-start sm:self-auto">
          {action.label}
        </ButtonLink>
      )}
    </div>
  );
}
