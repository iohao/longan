interface SkillsShIconProps {
  className?: string;
}

export default function SkillsShIcon({ className = "h-3.5 w-3.5" }: SkillsShIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8 1L16 15H0L8 1Z"
      />
    </svg>
  );
}
