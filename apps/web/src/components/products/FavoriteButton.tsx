import type { MouseEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useCurrentUserQuery } from "../../services/queries/auth";
import {
  useAddFavoriteMutation,
  useFavoriteSlugs,
  useRemoveFavoriteMutation,
} from "../../services/queries/favorites";

interface FavoriteButtonProps {
  slug: string;
  /** "icon": compact, for a card overlay. "labeled": icon + text, for the product detail page. */
  variant?: "icon" | "labeled";
  className?: string;
}

// A filled vs. outline heart (a shape change, not just a color change)
// plus aria-pressed/aria-label together carry the state — never color
// alone (§23/§52 of the auth brief).
export function FavoriteButton({ slug, variant = "icon", className = "" }: FavoriteButtonProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: currentUser } = useCurrentUserQuery();
  const isAuthenticated = Boolean(currentUser);
  const favoriteSlugs = useFavoriteSlugs(isAuthenticated);
  const isFavorite = favoriteSlugs.has(slug);
  const addFavorite = useAddFavoriteMutation();
  const removeFavorite = useRemoveFavoriteMutation();
  const isPending = addFavorite.isPending || removeFavorite.isPending;

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    // Cards wrap this button next to (not inside) a <Link> — see
    // ProductCard's own comment on why nesting was avoided — but this
    // still stops the click from also reaching anything else underneath.
    event.preventDefault();
    event.stopPropagation();

    if (!isAuthenticated) {
      // Preserve where the customer was and what they meant to do —
      // LoginPage/RegisterPage read this back to redirect and finish
      // the favorite after a successful sign-in (§24 of the auth brief).
      navigate("/login", {
        state: { from: `${location.pathname}${location.search}`, favoriteSlug: slug },
      });
      return;
    }

    if (isFavorite) {
      removeFavorite.mutate(slug);
    } else {
      addFavorite.mutate(slug);
    }
  }

  const label = isFavorite ? "Quitar de favoritos" : "Agregar a favoritos";

  const heart = (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
      fill={isFavorite ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 20.727c-.4 0-.79-.15-1.09-.42C7.14 17.09 3.5 13.42 3.5 9.6 3.5 6.83 5.66 4.6 8.35 4.6c1.6 0 3.06.82 3.65 2.14.59-1.32 2.05-2.14 3.65-2.14 2.69 0 4.85 2.23 4.85 5 0 3.82-3.64 7.49-7.41 10.71-.3.27-.69.42-1.09.42Z"
      />
    </svg>
  );

  if (variant === "labeled") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        aria-pressed={isFavorite}
        className={`inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
          isFavorite
            ? "border-primary bg-primary/10 text-primary"
            : "border-border text-text hover:border-primary hover:text-primary"
        } focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${className}`}
      >
        {heart}
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-pressed={isFavorite}
      aria-label={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border shadow-soft transition-colors disabled:opacity-60 ${
        isFavorite
          ? "border-primary bg-primary text-surface"
          : "border-border bg-surface text-text-muted hover:border-primary hover:text-primary"
      } focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${className}`}
    >
      {heart}
    </button>
  );
}
