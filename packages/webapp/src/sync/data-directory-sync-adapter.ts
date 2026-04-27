import type {
  AuthStatus,
  SyncAdapter,
  SyncMetadata,
  SyncServiceConfig,
} from './types.js'
import type { BookmarksStore } from '../types/bookmarks.js'
import { createClient, type WebDAVClient as WebDAVClientType } from '../lib/webdav-client.js'
import type { DataDirectoryCredentials, DataDirectoryTarget } from './types.js'

/**
 * Tide Mark data structures
 */
interface TideMarkTag {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

interface TideMarkFolder {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

interface TideMarkCollection {
  id: string
  name: string
  url: string
  description: string | null
  icon: string
  folderId: string
  tagIds: string[]
  count: number
  topUpTime: number
  createdAt: number
  updatedAt: number
}

interface TideMarkInfo {
  collectSortType: string
  defaultFolderKey: string
  enableSearchPage: boolean
  lang: string
  markMode: string
  updateAt: number
  version: number
  viewMode: string
}

interface TideMarkData {
  tags: TideMarkTag[]
  folders: TideMarkFolder[]
  collections: TideMarkCollection[]
  info: TideMarkInfo
}

/**
 * Transforms Tide Mark format to UTags bookmarks store format
 */
function transformToUtags(data: TideMarkData): BookmarksStore {
  const tagIdToName = new Map<string, string>()
  data.tags.forEach((tag) => {
    tagIdToName.set(tag.id, tag.name)
  })

  const bookmarksData: Record<string, { tags: string[]; meta: any }> = {}

  data.collections.forEach((collection) => {
    const tagNames = collection.tagIds
      .map((id) => tagIdToName.get(id))
      .filter((name): name is string => name !== undefined)

    bookmarksData[collection.url] = {
      tags: tagNames,
      meta: {
        url: collection.url,
        title: collection.name,
        description: collection.description || undefined,
        favicon: collection.icon,
        created: collection.createdAt * 1000,
        updated: collection.updatedAt * 1000,
      },
    }
  })

  return {
    data: bookmarksData,
    meta: {
      databaseVersion: data.info.version,
      created: data.info.updateAt,
      updated: data.info.updateAt,
    },
  }
}

/**
 * Transforms UTags bookmarks store to Tide Mark format
 */
function transformFromUtags(
  store: BookmarksStore,
  existingData?: TideMarkData
): TideMarkData {
  const tagNameToId = new Map<string, string>()
  const tagIdToName = new Map<string, string>()

  if (existingData) {
    existingData.tags.forEach((tag) => {
      tagNameToId.set(tag.name, tag.id)
      tagIdToName.set(tag.id, tag.name)
    })
  }

  const usedTagNames = new Set<string>()
  const collections: TideMarkCollection[] = []

  Object.entries(store.data).forEach(([url, entry]) => {
    entry.tags.forEach((tagName) => usedTagNames.add(tagName))

    const tagIds = entry.tags
      .map((name) => tagNameToId.get(name))
      .filter((id): id is string => id !== undefined)

    collections.push({
      id: existingData?.collections.find((c) => c.url === url)?.id || generateId(),
      name: entry.meta.title || url,
      url: url,
      description: entry.meta.description || null,
      icon: entry.meta.favicon || '',
      folderId: 'my',
      tagIds: tagIds,
      count: 0,
      topUpTime: 0,
      createdAt: entry.meta.created ? Math.floor(entry.meta.created / 1000) : Math.floor(Date.now() / 1000),
      updatedAt: entry.meta.updated ? Math.floor(entry.meta.updated / 1000) : Math.floor(Date.now() / 1000),
    })
  })

  const tags: TideMarkTag[] = []
  usedTagNames.forEach((tagName) => {
    if (tagNameToId.has(tagName)) {
      const existingTag = existingData?.tags.find((t) => t.name === tagName)
      if (existingTag) {
        tags.push(existingTag)
      }
    } else {
      const newId = generateId()
      tagNameToId.set(tagName, newId)
      const now = Math.floor(Date.now() / 1000)
      tags.push({
        id: newId,
        name: tagName,
        createdAt: now,
        updatedAt: now,
      })
    }
  })

  const folders: TideMarkFolder[] = existingData?.folders || [
    {
      id: 'my',
      name: 'My Collection',
      createdAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000),
    },
  ]

  const info: TideMarkInfo = existingData?.info || {
    collectSortType: 'create_time_asc',
    defaultFolderKey: 'my',
    enableSearchPage: true,
    lang: 'en',
    markMode: 'auto',
    updateAt: Date.now(),
    version: 3,
    viewMode: 'card-simple',
  }
  info.updateAt = Date.now()

  return { tags, folders, collections, info }
}

/**
 * Generates a random ID similar to nanoid
 */
function generateId(length = 10): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

export class DataDirectorySyncAdapter implements SyncAdapter<
  DataDirectoryCredentials,
  DataDirectoryTarget
> {
  private config: SyncServiceConfig<DataDirectoryCredentials, DataDirectoryTarget> | undefined
  private client: WebDAVClientType | undefined

  /**
   * Initializes the Data Directory sync adapter with the given configuration.
   * Uses WebDAV to access the Tide Mark data directory.
   * @param config - The configuration for the Data Directory service, including WebDAV URL and path.
   * @throws Error if configuration is not provided or if the WebDAV connection test fails.
   */
  async init(
    config: SyncServiceConfig<DataDirectoryCredentials, DataDirectoryTarget>
  ): Promise<void> {
    if (!config) {
      throw new Error('Configuration must be provided for DataDirectorySyncAdapter.')
    }

    if (!config.target.url) {
      throw new Error('WebDAV URL must be provided for DataDirectorySyncAdapter.')
    }

    this.config = config

    this.client = createClient(config.target.url, {
      username: config.credentials?.username,
      password: config.credentials?.password,
    })

    try {
      await this.client.getDirectoryContents('/')
    } catch (error: any) {
      console.error('WebDAV initial connection test failed:', error)
      throw new Error(`WebDAV initial connection test failed: ${error.message || error}`)
    }
  }

  /**
   * Cleans up resources used by the adapter.
   */
  destroy(): void {
    console.log('DataDirectorySyncAdapter destroyed.')
  }

  /**
   * Gets the current configuration of the adapter.
   * @returns The current configuration of the adapter.
   */
  getConfig(): SyncServiceConfig<DataDirectoryCredentials, DataDirectoryTarget> {
    if (!this.config) {
      throw new Error('DataDirectorySyncAdapter not initialized. Call init() first.')
    }

    return this.config
  }

  /**
   * Gets the full file path for the given filename.
   */
  private getFilePath(filename: string): string {
    if (!this.config) {
      throw new Error('DataDirectorySyncAdapter not initialized.')
    }

    const basePath = this.config.target.path || ''
    return basePath.endsWith('/') ? `${basePath}${filename}` : `${basePath}/${filename}`
  }

  /**
   * Reads a JSON file from WebDAV.
   */
  private async readJsonFile<T>(filename: string, defaultValue: T): Promise<T> {
    try {
      const filePath = this.getFilePath(filename)
      const content = await this.client!.getFileContents(filePath, { format: 'text' }) as string
      return JSON.parse(content)
    } catch (error: any) {
      if (error.status === 404) {
        return defaultValue
      }
      console.warn(`Failed to read ${filename}:`, error.message)
      return defaultValue
    }
  }

  /**
   * Writes a JSON file to WebDAV.
   */
  private async writeJsonFile<T>(filename: string, data: T): Promise<void> {
    const filePath = this.getFilePath(filename)
    const parentPath = filePath.substring(0, filePath.lastIndexOf('/'))

    try {
      await this.client!.createDirectory(parentPath, { recursive: true })
    } catch (error: any) {
      if (error.status !== 405) {
        throw error
      }
    }

    await this.client!.putFileContents(filePath, JSON.stringify(data, null, 2))
  }

  /**
   * Gets file statistics from WebDAV.
   */
  private async statFile(filename: string): Promise<{ timestamp: number; etag?: string } | undefined> {
    try {
      const filePath = this.getFilePath(filename)
      const stat = await this.client!.stat(filePath)
      return {
        timestamp: new Date(stat.lastmod).getTime(),
        etag: stat.etag
      }
    } catch (error: any) {
      if (error.status === 404) {
        return undefined
      }
      throw error
    }
  }

  /**
   * Retrieves metadata of the remote file from WebDAV.
   * @returns A promise that resolves with the remote metadata, or undefined if not found.
   */
  async getRemoteMetadata(): Promise<SyncMetadata | undefined> {
    if (!this.client) {
      throw new Error('DataDirectorySyncAdapter not initialized.')
    }

    try {
      const stat = await this.statFile('collection.json')
      if (!stat) {
        return undefined
      }

      return {
        timestamp: stat.timestamp,
        version: stat.etag,
        sha: stat.etag,
      }
    } catch (error: any) {
      console.error(`DataDirectory getRemoteMetadata failed:`, error)
      throw new Error(`DataDirectory getRemoteMetadata failed: ${error.message}`)
    }
  }

  /**
   * Downloads data from WebDAV.
   * Reads all JSON files and transforms to UTags format.
   * @returns A promise that resolves with the downloaded data and its metadata.
   */
  async download(): Promise<{
    data: string | undefined
    remoteMeta: SyncMetadata | undefined
  }> {
    if (!this.client) {
      throw new Error('DataDirectorySyncAdapter not initialized.')
    }

    try {
      const stat = await this.statFile('collection.json')

      if (!stat) {
        return { data: undefined, remoteMeta: undefined }
      }

      const tags = await this.readJsonFile<TideMarkTag[]>('tag.json', [])
      const folders = await this.readJsonFile<TideMarkFolder[]>('folder.json', [])
      const collections = await this.readJsonFile<TideMarkCollection[]>('collection.json', [])
      const info = await this.readJsonFile<TideMarkInfo>('info.json', {
        collectSortType: 'create_time_asc',
        defaultFolderKey: 'my',
        enableSearchPage: true,
        lang: 'en',
        markMode: 'auto',
        updateAt: Date.now(),
        version: 3,
        viewMode: 'card-simple',
      })

      const tideMarkData: TideMarkData = { tags, folders, collections, info }
      const utagsStore = transformToUtags(tideMarkData)

      return {
        data: JSON.stringify(utagsStore),
        remoteMeta: {
          timestamp: stat.timestamp,
          version: stat.etag,
          sha: stat.etag,
        },
      }
    } catch (error: any) {
      console.error(`DataDirectory download failed:`, error)
      throw new Error(`DataDirectory download failed: ${error.message}`)
    }
  }

  /**
   * Uploads data to WebDAV.
   * Transforms from UTags format and writes to individual JSON files.
   * @param data - The stringified data to upload.
   * @param expectedRemoteMeta - Optional metadata of the remote file for optimistic locking.
   * @returns A promise that resolves with the metadata of the uploaded file.
   * @throws {Error} If the upload fails.
   */
  async upload(
    data: string,
    expectedRemoteMeta?: SyncMetadata
  ): Promise<SyncMetadata> {
    if (!this.client || !this.config) {
      throw new Error('DataDirectorySyncAdapter not initialized. Call init() first.')
    }

    try {
      if (expectedRemoteMeta?.timestamp) {
        const currentStat = await this.statFile('collection.json')
        if (currentStat && currentStat.timestamp !== expectedRemoteMeta.timestamp) {
          throw new Error('DataDirectory upload failed: Precondition Failed (timestamp mismatch)')
        }
      }

      const store: BookmarksStore = JSON.parse(data)

      const existingTags = await this.readJsonFile<TideMarkTag[]>('tag.json', [])
      const existingFolders = await this.readJsonFile<TideMarkFolder[]>('folder.json', [])
      const existingCollections = await this.readJsonFile<TideMarkCollection[]>('collection.json', [])
      const existingInfo = await this.readJsonFile<TideMarkInfo>('info.json', {
        collectSortType: 'create_time_asc',
        defaultFolderKey: 'my',
        enableSearchPage: true,
        lang: 'en',
        markMode: 'auto',
        updateAt: Date.now(),
        version: 3,
        viewMode: 'card-simple',
      })

      const existingData: TideMarkData = {
        tags: existingTags,
        folders: existingFolders,
        collections: existingCollections,
        info: existingInfo,
      }

      const tideMarkData = transformFromUtags(store, existingData)

      await this.writeJsonFile('tag.json', tideMarkData.tags)
      await this.writeJsonFile('folder.json', tideMarkData.folders)
      await this.writeJsonFile('collection.json', tideMarkData.collections)
      await this.writeJsonFile('info.json', tideMarkData.info)

      const newStat = await this.statFile('collection.json')
      if (!newStat) {
        throw new Error('DataDirectory upload failed: Failed to get metadata after upload')
      }

      return {
        timestamp: newStat.timestamp,
        version: newStat.etag,
        sha: newStat.etag,
      }
    } catch (error: any) {
      console.error(`DataDirectory upload error:`, error)
      throw new Error(`DataDirectory upload failed: ${error.message}`)
    }
  }

  /**
   * Checks the authentication status with WebDAV.
   * @returns A promise that resolves with the AuthStatus.
   */
  async getAuthStatus(): Promise<AuthStatus> {
    if (!this.client) {
      if (!this.config?.target?.url) return 'requires_config'
      return 'error'
    }

    try {
      await this.client.getDirectoryContents('/')
      return 'authenticated'
    } catch (error: any) {
      console.warn('DataDirectory auth status check failed:', error)
      if (error.status === 401) {
        return 'unauthenticated'
      }
      return 'error'
    }
  }
}

export { transformToUtags, transformFromUtags }
