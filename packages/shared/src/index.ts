import { z } from "zod";

// ── Tracks ──

export const trackListItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  artist: z.string(),
  genre: z.string().nullable(),
  releaseDate: z.string(),
  artworkUrl: z.string().nullable(),
  previewable: z.boolean(),
  createdAt: z.string(),
});

export type TrackListItem = z.infer<typeof trackListItemSchema>;

export const trackDetailSchema = trackListItemSchema.extend({
  hasPreview: z.boolean(),
  isDownloadable: z.boolean(),
});

export type TrackDetail = z.infer<typeof trackDetailSchema>;

// ── Playlists ──

export const playlistListItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  trackCount: z.number().int(),
  createdAt: z.string(),
});

export type PlaylistListItem = z.infer<typeof playlistListItemSchema>;

export const playlistDetailSchema = playlistListItemSchema.extend({
  tracks: z.array(trackListItemSchema),
});

export type PlaylistDetail = z.infer<typeof playlistDetailSchema>;
