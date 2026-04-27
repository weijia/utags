import { describe, it, expect, vi, beforeEach } from 'vitest'
import { transformToUtags, transformFromUtags, DataDirectorySyncAdapter } from './data-directory-sync-adapter.js'
import type { BookmarksStore } from '../types/bookmarks.js'
import type { SyncServiceConfig } from './types.js'

// Mock WebDAV client
vi.mock('../lib/webdav-client.js', () => ({
  createClient: vi.fn(() => ({
    getDirectoryContents: vi.fn().mockResolvedValue([]),
    stat: vi.fn(),
    getFileContents: vi.fn(),
    putFileContents: vi.fn(),
    createDirectory: vi.fn(),
  })),
}))

// Mock fs module
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    statSync: vi.fn(),
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
  }
})

// Mock path module
vi.mock('path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('path')>()
  return {
    ...actual,
    dirname: vi.fn((path) => path.substring(0, path.lastIndexOf('/'))),
    join: vi.fn((...paths) => paths.join('/')),
  }
})

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
  })

  it('should initialize in WebDAV mode', async () => {
    await adapter.init(config)
    expect(adapter.getConfig()).toEqual(config)
  })

  it('should handle WebDAV authentication', async () => {
    await adapter.init(config)
    const authStatus = await adapter.getAuthStatus()
    expect(authStatus).toBe('authenticated')
  })

  it('should download data from WebDAV', async () => {
    // Mock the WebDAV client methods directly
    const mockStat = vi.fn().mockResolvedValue({
      lastmod: new Date().toISOString(),
      etag: 'test-etag'
    })
    const mockGetFileContents = vi.fn()
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

    // Update the mock to return our mocked methods
    const webdavClientModule = await import('../lib/webdav-client.js')
    vi.mocked(webdavClientModule.createClient).mockReturnValue({
      getDirectoryContents: vi.fn().mockResolvedValue([]),
      stat: mockStat,
      getFileContents: mockGetFileContents,
      putFileContents: vi.fn(),
      createDirectory: vi.fn(),
    } as any)

    await adapter.init(config)
    const result = await adapter.download()
    expect(result.data).toBeDefined()
  })

  it('should upload data to WebDAV', async () => {
    // Mock the WebDAV client methods directly
    const mockStat = vi.fn().mockResolvedValue({
      lastmod: new Date().toISOString(),
      etag: 'test-etag'
    })
    const mockGetFileContents = vi.fn().mockResolvedValue('[]') // existing data
    const mockPutFileContents = vi.fn().mockResolvedValue(undefined)
    const mockCreateDirectory = vi.fn().mockResolvedValue(undefined)

    // Update the mock to return our mocked methods
    const webdavClientModule = await import('../lib/webdav-client.js')
    vi.mocked(webdavClientModule.createClient).mockReturnValue({
      getDirectoryContents: vi.fn().mockResolvedValue([]),
      stat: mockStat,
      getFileContents: mockGetFileContents,
      putFileContents: mockPutFileContents,
      createDirectory: mockCreateDirectory,
    } as any)

    await adapter.init(config)
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
})
