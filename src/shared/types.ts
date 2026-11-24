export type ItemStatus =
  | 'fetching' // resolving metadata
  | 'ready' // metadata resolved, waiting for a manual start
  | 'queued' // start requested, waiting for a free download slot
  | 'downloading'
  | 'processing' // yt-dlp is merging / remuxing via ffmpeg
  | 'completed'
  | 'error'
  | 'canceled'

export interface Progress {
  percent: number
  speed: string
  eta: string
  downloaded: number
  total: number
}

export interface QueueItem {
  id: string
  url: string
  status: ItemStatus
  addedAt: number
  title?: string
  thumbnail?: string
  duration?: number
  uploader?: string
  extractor?: string
  webpageUrl?: string
  uploadDate?: string
  viewCount?: number
  filesizeApprox?: number
  resolution?: string
  ext?: string
  progress?: Progress
  filePath?: string
  error?: string
  captchaUrl?: string
  cookieFile?: string
  streamUrl?: string
  streamHeaders?: string[]
}

export interface Settings {
  downloadDir: string
  concurrency: number
  autoStart: boolean
  outputTemplate: string
}

export interface BinaryInfo {
  path: string
  found: boolean
  version: string | null
  source: 'user' | 'bundled' | 'path' | 'missing'
}

export interface BinariesInfo {
  ytdlp: BinaryInfo
  ffmpeg: BinaryInfo
}

export interface AddResult {
  added: number
  duplicates: number
  invalid: string[]
}

export interface UpdateResult {
  ok: boolean
  version?: string
  message: string
}
