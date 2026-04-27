import { describe, it, expect, vi, beforeEach } from 'vitest'
import { transformToUtags, transformFromUtags, DataDirectorySyncAdapter } from './data-directory-sync-adapter.js'
import type { BookmarksStore } from '../types/bookmarks.js'
import type { SyncServiceConfig } from './types.js'

// Mock WebDAV client
const mockClient = {
  getDirectoryContents: vi.fn().mockResolvedValue([]),
  stat: vi.fn(),
  getFileContents: vi.fn(),
  putFileContents: vi.fn(),
  createDirectory: vi.fn(),
}

vi.mock('../lib/webdav-client.js', () => ({
  createClient: vi.fn(() => mockClient),
}))

describe('transformToUtags', () => {
  it('should transform Tide Mark data to UTags format', () => {
    const tideMarkData = {
      tags: [
        { id: 'tag1', name: 'work', createdAt: 1234567890, updatedAt: 1234567890 },
        { id: 'tag2', name: 'personal', createdAt: 1234567890, updatedAt: 1234567890 },
      ],
      folders: [{ id: 'my', name: 'My Collection', createdAt: 1234567890, updatedAt: 1234567890 }],
      collections: [
        {
          id: 'col1',
          name: 'Example Site',
          url: 'https://example.com',
          description: 'An example website',
          icon: 'https://example.com/favicon.ico',
          folderId: 'my',
          tagIds: ['tag1'],
          count: 5,
          topUpTime: 0,
          createdAt: 1234567890,
          updatedAt: 1234567890,
        },
      ],
      info: {
        collectSortType: 'create_time_asc',
        defaultFolderKey: 'my',
        enableSearchPage: true,
        lang: 'en',
        markMode: 'auto',
        updateAt: 1234567890000,
        version: 3,
        viewMode: 'card-simple',
      },
    }

    const result = transformToUtags(tideMarkData)

    expect(result.data['https://example.com']).toBeDefined()
    expect(result.data['https://example.com'].tags).toEqual(['work'])
    expect(result.data['https://example.com'].meta.title).toBe('Example Site')
    expect(result.data['https://example.com'].meta.description).toBe('An example website')
    expect(result.data['https://example.com'].meta.favicon).toBe('https://example.com/favicon.ico')
    expect(result.meta.databaseVersion).toBe(3)
  })

  it('should handle missing tagIds gracefully', () => {
    const tideMarkData = {
      tags: [],
      folders: [],
      collections: [
        {
          id: 'col1',
          name: 'No Tags Bookmark',
          url: 'https://notags.com',
          description: null,
          icon: '',
          folderId: 'my',
          tagIds: ['nonexistent-tag'],
          count: 0,
          topUpTime: 0,
          createdAt: 1234567890,
          updatedAt: 1234567890,
        },
      ],
      info: {
        collectSortType: 'create_time_asc',
        defaultFolderKey: 'my',
        enableSearchPage: true,
        lang: 'en',
        markMode: 'auto',
        updateAt: 1234567890000,
        version: 3,
        viewMode: 'card-simple',
      },
    }

    const result = transformToUtags(tideMarkData)

    expect(result.data['https://notags.com'].tags).toEqual([])
  })

  it('should handle empty collections', () => {
    const tideMarkData = {
      tags: [],
      folders: [],
      collections: [],
      info: {
        collectSortType: 'create_time_asc',
        defaultFolderKey: 'my',
        enableSearchPage: true,
        lang: 'en',
        markMode: 'auto',
        updateAt: 1234567890000,
        version: 3,
        viewMode: 'card-simple',
      },
    }

    const result = transformToUtags(tideMarkData)

    expect(Object.keys(result.data)).toHaveLength(0)
  })
})

describe('transformFromUtags', () => {
  it('should transform UTags store to Tide Mark format', () => {
    const store: BookmarksStore = {
      data: {
        'https://example.com': {
          tags: ['work', 'important'],
          meta: {
            url: 'https://example.com',
            title: 'Example',
            description: 'An example site',
            created: 1234567890000,
            updated: 1234567890000,
          },
        },
      },
      meta: {
        databaseVersion: 3,
        created: 1234567890000,
        updated: 1234567890000,
      },
    }

    const result = transformFromUtags(store)

    expect(result.collections.length).toBe(1)
    expect(result.collections[0].url).toBe('https://example.com')
    expect(result.collections[0].name).toBe('Example')
    expect(result.tags.length).toBeGreaterThanOrEqual(2)
    expect(result.tags.map((t) => t.name)).toContain('work')
    expect(result.tags.map((t) => t.name)).toContain('important')
  })

  it('should preserve existing tag IDs when transforming back', () => {
    const store: BookmarksStore = {
      data: {
        'https://example.com': {
          tags: ['work'],
          meta: {
            url: 'https://example.com',
            title: 'Example',
            created: 1234567890000,
            updated: 1234567890000,
          },
        },
      },
      meta: {
        databaseVersion: 3,
        created: 1234567890000,
        updated: 1234567890000,
      },
    }

    const existingData = {
      tags: [{ id: 'existing-tag-id', name: 'work', createdAt: 1234567890, updatedAt: 1234567890 }],
      folders: [],
      collections: [],
      info: {
        collectSortType: 'create_time_asc',
        defaultFolderKey: 'my',
        enableSearchPage: true,
        lang: 'en',
        markMode: 'auto',
        updateAt: 1234567890000,
        version: 3,
        viewMode: 'card-simple',
      },
    }

    const result = transformFromUtags(store, existingData)

    const workTag = result.tags.find((t) => t.name === 'work')
    expect(workTag?.id).toBe('existing-tag-id')
  })

  it('should handle empty bookmarks store', () => {
    const store: BookmarksStore = {
      data: {},
      meta: {
        databaseVersion: 3,
        created: 1234567890000,
        updated: 1234567890000,
      },
    }

    const result = transformFromUtags(store)

    expect(result.collections).toHaveLength(0)
  })

  it('should create new tag IDs for new tag names', () => {
    const store: BookmarksStore = {
      data: {
        'https://example.com': {
          tags: ['new-tag'],
          meta: {
            url: 'https://example.com',
            title: 'Example',
            created: 1234567890000,
            updated: 1234567890000,
          },
        },
      },
      meta: {
        databaseVersion: 3,
        created: 1234567890000,
        updated: 1234567890000,
      },
    }

    const result = transformFromUtags(store)

    const newTag = result.tags.find((t) => t.name === 'new-tag')
    expect(newTag).toBeDefined()
    expect(newTag?.id).toBeDefined()
    expect(newTag?.id.length).toBeGreaterThan(0)
  })
})

describe('DataDirectorySyncAdapter - WebDAV mode', () => {
  let adapter: DataDirectorySyncAdapter
  let config: SyncServiceConfig<any, any>

  beforeEach(() => {
    adapter = new DataDirectorySyncAdapter()
    config = {
      id: 'test-config',
      type: 'dataDirectory',
      name: 'Test WebDAV',
      credentials: {
        username: 'test-user',
        password: 'test-pass'
      },
      target: {
        url: 'https://webdav.example.com',
        path: '/tide-mark'
      }
    }
    // Reset mock functions before each test
    mockClient.getDirectoryContents.mockResolvedValue([])
    mockClient.stat.mockReset()
    mockClient.getFileContents.mockReset()
    mockClient.putFileContents.mockReset()
    mockClient.createDirectory.mockReset()
  })

  it('should initialize in WebDAV mode', async () => {
    await adapter.init(config)
    expect(adapter.getConfig()).toEqual(config)
  })

  it('should throw error if URL is not provided', async () => {
    const configWithoutUrl = {
      ...config,
      target: { path: '/tide-mark' }
    }
    await expect(adapter.init(configWithoutUrl)).rejects.toThrow('WebDAV URL must be provided')
  })

  it('should handle WebDAV authentication', async () => {
    await adapter.init(config)
    const authStatus = await adapter.getAuthStatus()
    expect(authStatus).toBe('authenticated')
  })

  it('should download data from WebDAV', async () => {
    await adapter.init(config)
    
    mockClient.stat.mockResolvedValue({
      lastmod: new Date().toISOString(),
      etag: 'test-etag'
    })
    mockClient.getFileContents
      .mockResolvedValueOnce('[]') // tags
      .mockResolvedValueOnce('[]') // folders
      .mockResolvedValueOnce('[]') // collections
      .mockResolvedValueOnce(JSON.stringify({
        collectSortType: 'create_time_asc',
        defaultFolderKey: 'my',
        enableSearchPage: true,
        lang: 'en',
        markMode: 'auto',
        updateAt: Date.now(),
        version: 3,
        viewMode: 'card-simple'
      })) // info

    const result = await adapter.download()
    expect(result.data).toBeDefined()
  })

  it('should upload data to WebDAV', async () => {
    await adapter.init(config)
    
    mockClient.stat.mockResolvedValue({
      lastmod: new Date().toISOString(),
      etag: 'test-etag'
    })
    mockClient.getFileContents.mockResolvedValue('[]') // existing data

    const testData: BookmarksStore = {
      data: {},
      meta: {
        databaseVersion: 3,
        created: Date.now(),
        updated: Date.now()
      }
    }

    const result = await adapter.upload(JSON.stringify(testData))
    expect(result.timestamp).toBeDefined()
  })

  it('should return requires_config when config is missing', async () => {
    const newAdapter = new DataDirectorySyncAdapter()
    const authStatus = await newAdapter.getAuthStatus()
    expect(authStatus).toBe('requires_config')
  })
})
