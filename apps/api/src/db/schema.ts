import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const trackVersionKindEnum = pgEnum("track_version_kind", [
  "standard",
  "clean",
  "dirty",
  "intro",
  "radio",
  "instrumental",
  "extended",
  "acapella",
]);

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  role: text("role").notNull().default("member"),
  stripeCustomerId: text("stripe_customer_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  stripeSubscriptionId: text("stripe_subscription_id").notNull().unique(),
  status: text("status").notNull(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Parent catalog record (metadata + artwork). Audio lives on `track_versions`. */
export const tracks = pgTable("tracks", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  genre: text("genre"),
  /** Whole BPM when known (ID3 or estimated). */
  bpm: integer("bpm"),
  /** e.g. `A Min`, `F# Maj`, or raw tag string */
  musicalKey: text("musical_key"),
  releaseDate: timestamp("release_date", { mode: "date" }).notNull(),
  artworkKey: text("artwork_key"),
  isDownloadable: boolean("is_downloadable").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const trackVersions = pgTable(
  "track_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trackId: uuid("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    kind: trackVersionKindEnum("kind").notNull(),
    masterKey: text("master_key").notNull(),
    previewKey: text("preview_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique().on(t.trackId, t.kind)],
);

export const playlists = pgTable("playlists", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description"),
  artworkKey: text("artwork_key"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const playlistTracks = pgTable(
  "playlist_tracks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    playlistId: uuid("playlist_id")
      .notNull()
      .references(() => playlists.id, { onDelete: "cascade" }),
    trackId: uuid("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    addedAt: timestamp("added_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique().on(t.playlistId, t.trackId)],
);
