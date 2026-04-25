/**
 * Minimal WebDAV client implementation
 * Supports basic WebDAV operations with authentication
 */

import {
  HttpClient,
  type HttpRequestOptions,
  type HttpResponse,
} from './http-client.js'

/**
 * WebDAV client configuration options
 */

export type WebDAVClientOptions = {
  username?: string
  password?: string
  headers?: Record<string, string>
}

/**
 * File statistics returned by WebDAV PROPFIND
 */
export type FileStat = {
  filename: string
  basename: string
  lastmod: string
  size: number
  type: 'file' | 'directory'
  etag?: string
}

/**
 * Options for putting file contents
 */
export type PutFileContentsOptions = {
  headers?: Record<string, string>
  format?: 'text' | 'binary'
}

/**
 * Options for getting file contents
 */
export type GetFileContentsOptions = {
  format?: 'text' | 'binary'
}

/**
 * Options for creating directories
 */
export type CreateDirectoryOptions = {
  recursive?: boolean
}

/**
 * WebDAV client error with status code
 */

export class WebDAVError extends Error {
  public status: number
  public statusText: string

  constructor(message: string, status: number, statusText: string) {
    super(message)
    this.name = 'WebDAVError'
    this.status = status
    this.statusText = statusText
  }
}

/**
 * Lightweight WebDAV client
 */

export class WebDAVClient {
  private readonly baseUrl: string
  private readonly options: WebDAVClientOptions

  constructor(baseUrl: string, options: WebDAVClientOptions = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '') // Remove trailing slash
    this.options = options
  }

  /**
   * Get file/directory statistics
   */
  async stat(path: string): Promise<FileStat> {
    const propfindBody = `<?xml version="1.0" encoding="utf-8" ?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:displayname/>
    <D:getlastmodified/>
    <D:getcontentlength/>
    <D:getetag/>
    <D:resourcetype/>
  </D:prop>
</D:propfind>`

    const response = await this.makeRequest('PROPFIND', path, propfindBody, {
      Depth: '0',
    })

    const xmlText = await response.text()
    return this.parsePropfindResponse(xmlText, path)
  }

  /**
   * Get file contents
   */
  async getFileContents(
    path: string,
    options: GetFileContentsOptions = {}
  ): Promise<string | ArrayBuffer> {
    const response = await this.makeRequest('GET', path)

    if (options.format === 'binary') {
      return response.arrayBuffer()
    }

    return response.text()
  }

  /**
   * Put file contents
   */
  async putFileContents(
    path: string,
    data: string | ArrayBuffer,
    options: PutFileContentsOptions = {}
  ): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/octet-stream',
      ...options.headers,
    }

    await this.makeRequest('PUT', path, data as string, headers)
  }

  /**
   * Create directory
   */
  async createDirectory(
    path: string,
    options: CreateDirectoryOptions = {}
  ): Promise<void> {
    if (options.recursive) {
      // Create parent directories recursively
      const pathParts = path.split('/').filter((part) => part.length > 0)
      let currentPath = ''

      for (const part of pathParts) {
        currentPath += '/' + part
        try {
          // eslint-disable-next-line no-await-in-loop
          await this.makeRequest('MKCOL', currentPath)
        } catch (error) {
          // Ignore 405 Method Not Allowed (directory already exists)
          if (error instanceof WebDAVError && error.status !== 405) {
            throw error
          }
        }
      }
    } else {
      await this.makeRequest('MKCOL', path)
    }
  }

  /**
   * Get directory contents
   */
  async getDirectoryContents(path: string): Promise<FileStat[]> {
    const propfindBody = `<?xml version="1.0" encoding="utf-8" ?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:displayname/>
    <D:getlastmodified/>
    <D:getcontentlength/>
    <D:getetag/>
    <D:resourcetype/>
  </D:prop>
</D:propfind>`

    const response = await this.makeRequest('PROPFIND', path, propfindBody, {
      Depth: '1',
    })

    const xmlText = await response.text()
    const parser = new DOMParser()
    const doc = parser.parseFromString(xmlText, 'text/xml')

    const responses = doc.getElementsByTagNameNS('DAV:', 'response')
    const results: FileStat[] = []

    for (const response of responses) {
      const href = response.getElementsByTagNameNS('DAV:', 'href')[0]
        ?.textContent

      if (href && !this.pathMatches(href, path)) {
        // Skip the parent directory itself
        const propstat = response.getElementsByTagNameNS('DAV:', 'propstat')[0]
        const prop = propstat?.getElementsByTagNameNS('DAV:', 'prop')[0]

        if (prop) {
          const displayName =
            prop.getElementsByTagNameNS('DAV:', 'displayname')[0]
              ?.textContent || ''
          const lastModified =
            prop.getElementsByTagNameNS('DAV:', 'getlastmodified')[0]
              ?.textContent || ''
          const contentLength =
            prop.getElementsByTagNameNS('DAV:', 'getcontentlength')[0]
              ?.textContent || '0'
          const etag = prop.getElementsByTagNameNS('DAV:', 'getetag')[0]
            ?.textContent
          const resourceType = prop.getElementsByTagNameNS(
            'DAV:',
            'resourcetype'
          )[0]
          const isCollection =
            resourceType?.getElementsByTagNameNS('DAV:', 'collection').length >
            0

          const filename = href.split('/').pop() || displayName

          results.push({
            filename,
            basename: filename,
            lastmod: lastModified,
            size: Number.parseInt(contentLength, 10),
            type: isCollection ? 'directory' : 'file',
            etag: etag?.replace(/"/g, ''), // Remove quotes from etag
          })
        }
      }
    }

    return results
  }

  /**
   * Create authorization header
   */
  private createAuthHeader(): string | undefined {
    if (this.options.username && this.options.password) {
      // eslint-disable-next-line no-restricted-globals
      const credentials = btoa(
        `${this.options.username}:${this.options.password}`
      )
      return `Basic ${credentials}`
    }

    return undefined
  }

  /**
   * Create default headers for requests
   */
  private createHeaders(
    additionalHeaders: Record<string, string> = {}
  ): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/xml; charset=utf-8',
      ...this.options.headers,
      ...additionalHeaders,
    }

    const authHeader = this.createAuthHeader()
    if (authHeader) {
      headers.Authorization = authHeader
    }

    return headers
  }

  /**
   * Make HTTP request using the universal HTTP client
   */
  private async makeRequest(
    method: string,
    path: string,
    body?: string,
    headers: Record<string, string> = {}
  ): Promise<HttpResponse> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : '/' + path}`
    const requestHeaders = this.createHeaders(headers)

    const options: HttpRequestOptions = {
      method,
      url,
      headers: requestHeaders,
      body,
    }

    const response = await HttpClient.request(options)

    if (!response.ok) {
      throw new WebDAVError(
        `Invalid response: ${response.status} ${response.statusText}`,
        response.status,
        response.statusText
      )
    }

    return response
  }

  /**
   * Parse PROPFIND XML response
   */
  private parsePropfindResponse(
    xmlText: string,
    requestPath: string
  ): FileStat {
    const parser = new DOMParser()
    const doc = parser.parseFromString(xmlText, 'text/xml')

    // Log the full XML response for debugging
    console.log(`WebDAV PROPFIND response XML: ${xmlText.substring(0, 500)}...`)

    // Find the response element for the requested path
    const responses = doc.getElementsByTagNameNS('DAV:', 'response')
    console.log(`WebDAV PROPFIND found ${responses.length} responses`)

    // First try exact path match
    for (const response of responses) {
      const href = response.getElementsByTagNameNS('DAV:', 'href')[0]
        ?.textContent

      if (href && this.pathMatches(href, requestPath)) {
        const propstat = response.getElementsByTagNameNS('DAV:', 'propstat')[0]
        const prop = propstat?.getElementsByTagNameNS('DAV:', 'prop')[0]

        if (prop) {
          const displayName = 
            prop.getElementsByTagNameNS('DAV:', 'displayname')[0]
              ?.textContent || ''
          const lastModified = 
            prop.getElementsByTagNameNS('DAV:', 'getlastmodified')[0]
              ?.textContent || ''
          const contentLength = 
            prop.getElementsByTagNameNS('DAV:', 'getcontentlength')[0]
              ?.textContent || '0'
          const etag = prop.getElementsByTagNameNS('DAV:', 'getetag')[0]
            ?.textContent
          const resourceType = prop.getElementsByTagNameNS(
            'DAV:',
            'resourcetype'
          )[0]
          const isCollection = 
            resourceType?.getElementsByTagNameNS('DAV:', 'collection').length >
            0

          const filename = href.split('/').pop() || displayName

          console.log(`WebDAV PROPFIND: Found exact match for ${requestPath}, ETag: ${etag}`)
          return {
            filename,
            basename: filename,
            lastmod: lastModified,
            size: Number.parseInt(contentLength, 10),
            type: isCollection ? 'directory' : 'file',
            etag: etag?.replace(/"/g, ''), // Remove quotes from etag
          }
        }
      }
    }

    // If no exact match, try matching by filename
    const requestFilename = requestPath.split('/').pop()
    if (requestFilename) {
      console.log(`WebDAV PROPFIND: No exact match found, trying filename match for ${requestFilename}`)
      for (const response of responses) {
        const href = response.getElementsByTagNameNS('DAV:', 'href')[0]
          ?.textContent
        if (href) {
          const responseFilename = href.split('/').pop()
          if (responseFilename === requestFilename) {
            const propstat = response.getElementsByTagNameNS('DAV:', 'propstat')[0]
            const prop = propstat?.getElementsByTagNameNS('DAV:', 'prop')[0]
            if (prop) {
              const displayName = 
                prop.getElementsByTagNameNS('DAV:', 'displayname')[0]
                  ?.textContent || ''
              const lastModified = 
                prop.getElementsByTagNameNS('DAV:', 'getlastmodified')[0]
                  ?.textContent || ''
              const contentLength = 
                prop.getElementsByTagNameNS('DAV:', 'getcontentlength')[0]
                  ?.textContent || '0'
              const etag = prop.getElementsByTagNameNS('DAV:', 'getetag')[0]
                ?.textContent
              const resourceType = prop.getElementsByTagNameNS(
                'DAV:',
                'resourcetype'
              )[0]
              const isCollection = 
                resourceType?.getElementsByTagNameNS('DAV:', 'collection').length >
                0

              console.log(`WebDAV PROPFIND: Found filename match for ${requestFilename}, ETag: ${etag}`)
              return {
                filename: responseFilename,
                basename: responseFilename,
                lastmod: lastModified,
                size: Number.parseInt(contentLength, 10),
                type: isCollection ? 'directory' : 'file',
                etag: etag?.replace(/"/g, ''), // Remove quotes from etag
              }
            }
          }
        }
      }
    }

    // If still no match, throw error
    console.error(`WebDAV PROPFIND: No match found for ${requestPath} in ${responses.length} responses`)
    throw new WebDAVError(
      'Resource not found in PROPFIND response',
      404,
      'Not Found'
    )
  }

  /**
   * Check if two paths match (handling URL encoding, trailing slashes, and full URLs)
   */
  private pathMatches(href: string, requestPath: string): boolean {
    // Normalize both paths by removing trailing slashes and decoding URI components
    let normalizeHref = decodeURIComponent(href).replace(/\/$/, '')
    const normalizeRequest = requestPath.replace(/\/$/, '')
    
    // If href is a full URL, extract just the path part
    if (normalizeHref.includes('://')) {
      const url = new URL(normalizeHref)
      normalizeHref = url.pathname.replace(/\/$/, '')
    }
    
    // Check if href starts with baseUrl path (e.g., /dav/), if so, remove it for comparison
    const baseUrlPath = new URL(this.baseUrl).pathname.replace(/\/$/, '')
    if (baseUrlPath && normalizeHref.startsWith(baseUrlPath)) {
      normalizeHref = normalizeHref.substring(baseUrlPath.length)
      if (normalizeHref && !normalizeHref.startsWith('/')) {
        normalizeHref = '/' + normalizeHref
      }
    }
    
    // Log path matching for debugging
    console.log(`WebDAV path matching: href='${href}', normalizedHref='${normalizeHref}', requestPath='${requestPath}', normalizedRequest='${normalizeRequest}', baseUrlPath='${baseUrlPath}'`)
    
    // Use exact match to avoid matching different files
    return normalizeHref === normalizeRequest
  }
}

/**
 * Create a WebDAV client instance
 */
export function createClient(
  baseUrl: string,
  options: WebDAVClientOptions = {}
): WebDAVClient {
  return new WebDAVClient(baseUrl, options)
}

// Export types for compatibility with the original webdav library
export type { WebDAVClient as WebDAVClientType }
