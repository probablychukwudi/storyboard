import type { SVGProps } from "react";

import { cn } from "@/lib/utils";

type StoryboardLogoProps = SVGProps<SVGSVGElement> & {
  variant?: "full" | "mark";
};

export function StoryboardLogo({ className, variant = "full", ...props }: StoryboardLogoProps) {
  const isMark = variant === "mark";

  return (
    <svg
      viewBox={isMark ? "64 48 330 330" : "0 0 1200 420"}
      fill="none"
      role="img"
      aria-label="Storyboard"
      className={cn("block shrink-0 text-current", className)}
      {...props}
    >
      <g id="storyboard-mark" transform="translate(72 56)">
        <rect
          x="8"
          y="8"
          width="288"
          height="288"
          rx="64"
          stroke="currentColor"
          strokeWidth="16"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M82 196V82H202"
          stroke="currentColor"
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M112 216V112H232"
          stroke="currentColor"
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect
          x="142"
          y="142"
          width="118"
          height="98"
          rx="9"
          stroke="currentColor"
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="179" cy="177" r="15" fill="currentColor" />
        <path d="M150 235L181 203L203 222L226 191L254 235H150Z" fill="currentColor" />
        <path
          d="M245 220H218V247"
          stroke="currentColor"
          strokeWidth="11"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M218 273V292H238"
          stroke="currentColor"
          strokeWidth="11"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M270 220H292V242"
          stroke="currentColor"
          strokeWidth="11"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M263 292H292V263"
          stroke="currentColor"
          strokeWidth="11"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="20 18"
        />
        <path
          d="M264 264L306 306"
          stroke="currentColor"
          strokeWidth="11"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M306 306H276"
          stroke="currentColor"
          strokeWidth="11"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M306 306V276"
          stroke="currentColor"
          strokeWidth="11"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      {!isMark && (
        <text
          x="424"
          y="245"
          fill="currentColor"
          fontFamily='-apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, "Helvetica Neue", Arial, sans-serif'
          fontSize="120"
          fontWeight="760"
          letterSpacing="0"
        >
          Storyboard
        </text>
      )}
    </svg>
  );
}
