# 潮汐收藏 (Tide Mark) 书签存储结构文档

## 概述

本目录包含了潮汐收藏书签管理应用的数据存储，采用JSON格式文件存储。数据结构设计用于管理用户的书签、标签、文件夹和应用程序配置。

## 目录结构

```
data/
├── info.json         # 应用程序配置和用户设置
├── tag.json          # 标签定义
├── collection.json   # 书签/收藏项
└── folder.json       # 文件夹定义
```

## 数据模型

### 1. info.json - 应用程序配置

存储应用程序的配置信息和用户偏好设置。

```json
{
  "collectSortType": "create_time_asc",  // 收藏排序类型
  "defaultFolderKey": "my",             // 默认文件夹键
  "enableSearchPage": true,             // 是否启用搜索页面
  "lang": "zh-CN",                       // 语言设置
  "markMode": "auto",                    // 标记模式
  "updateAt": 1776426037833,            // 最后更新时间戳
  "version": 3,                          // 数据版本
  "viewMode": "card-simple"              // 视图模式
}
```

| 字段 | 类型 | 描述 |
|------|------|------|
| collectSortType | string | 收藏排序方式，如 "create_time_asc"（按创建时间升序） |
| defaultFolderKey | string | 默认文件夹的标识符 |
| enableSearchPage | boolean | 是否启用独立搜索页面功能 |
| lang | string | 用户界面语言，如 "zh-CN" |
| markMode | string | 标记模式，如 "auto"（自动） |
| updateAt | number | 最后更新的 Unix 时间戳（毫秒） |
| version | number | 数据结构版本号 |
| viewMode | string | 书签列表的视图展示模式 |

### 2. tag.json - 标签定义

存储用户创建的所有标签。

```json
[
  {
    "createdAt": 1727665881,    // 创建时间戳（秒）
    "id": "JRkEYrT6HfYF",       // 唯一标识符
    "name": "minecraft",        // 标签名称
    "updatedAt": 1727665881     // 更新时间戳（秒）
  }
]
```

| 字段 | 类型 | 描述 |
|------|------|------|
| id | string | 标签的唯一标识符，使用 nanoid 生成 |
| name | string | 标签的显示名称 |
| createdAt | number | 创建时间的 Unix 时间戳（秒） |
| updatedAt | number | 最后修改时间的 Unix 时间戳（秒） |

### 3. collection.json - 书签/收藏项

存储用户的书签或收藏项，是主要的数据文件。

```json
[
  {
    "count": 0,                              // 访问计数
    "createdAt": 1727654257,                 // 创建时间戳
    "description": "潮汐收藏使用文档",         // 描述
    "folderId": "my",                        // 所属文件夹ID
    "icon": "https://help.tidemark.cc/icon.png", // 网站图标URL
    "id": "XDxCgrxmpOI8",                    // 唯一标识符
    "name": "欢迎使用|潮汐收藏",              // 书签名称
    "tagIds": [],                             // 关联的标签ID数组
    "topUpTime": 0,                          // 置顶时间
    "updatedAt": 1727654257,                 // 更新时间戳
    "url": "https://help.tidemark.cc/"       // 书签URL
  }
]
```

| 字段 | 类型 | 描述 |
|------|------|------|
| id | string | 书签的唯一标识符 |
| name | string | 书签的标题/名称 |
| url | string | 书签的目标 URL |
| description | string \| null | 书签的描述信息 |
| icon | string | 网站的 favicon 图标 URL |
| folderId | string | 所属文件夹的 ID |
| tagIds | string[] | 关联的标签 ID 数组 |
| count | number | 用户访问/点击计数 |
| topUpTime | number | 置顶时间戳，0 表示未置顶 |
| createdAt | number | 创建时间的 Unix 时间戳（秒） |
| updatedAt | number | 最后修改时间的 Unix 时间戳（秒） |

### 4. folder.json - 文件夹定义

存储用户的文件夹结构。

```json
[
  {
    "createdAt": 1728198101,    // 创建时间戳
    "id": "my",                // 文件夹唯一标识符
    "name": "My Collection",    // 文件夹名称
    "updatedAt": 1728198101     // 更新时间戳
  }
]
```

| 字段 | 类型 | 描述 |
|------|------|------|
| id | string | 文件夹的唯一标识符 |
| name | string | 文件夹的显示名称 |
| createdAt | number | 创建时间的 Unix 时间戳（秒） |
| updatedAt | number | 最后修改时间的 Unix 时间戳（秒） |

## 实体关系

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   folder    │       │    tag      │       │    info     │
│  (folder)   │       │   (tag)     │       │   (info)    │
└──────┬──────┘       └──────┬──────┘       └──────┬──────┘
       │                      │                      │
       │ 1:N                   │ N:M                 │
       ▼                      ▼                      │
┌─────────────────────────────────┐                  │
│           collection            │◄─────────────────┘
│         (书签/收藏项)            │     1:1 (配置参考)
└─────────────────────────────────┘
```

- **Folder -> Collection**: 一对多关系（一个文件夹可包含多个书签）
- **Tag -> Collection**: 多对多关系（一个标签可关联多个书签，一个书签可有多个标签）
- **Info**: 存储应用配置，与 Collection 通过 folderId 参考关联

## 数据类型定义 (TypeScript)

```typescript
// info.json
interface AppInfo {
  collectSortType: string;
  defaultFolderKey: string;
  enableSearchPage: boolean;
  lang: string;
  markMode: string;
  updateAt: number;
  version: number;
  viewMode: string;
}

// tag.json
interface Tag {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

// folder.json
interface Folder {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

// collection.json
interface Collection {
  id: string;
  name: string;
  url: string;
  description: string | null;
  icon: string;
  folderId: string;
  tagIds: string[];
  count: number;
  topUpTime: number;
  createdAt: number;
  updatedAt: number;
}
```

## 同步适配器说明

本项目为潮汐收藏书签存储实现了 `DataDirectorySyncAdapter` 同步适配器，支持：

- **下载 (download)**: 从 data 目录读取所有 JSON 文件并合并为统一的书签数据格式
- **上传 (upload)**: 将书签数据分离并写入对应的 JSON 文件
- **元数据 (getRemoteMetadata)**: 获取书签文件的修改时间戳和大小
- **认证状态 (getAuthStatus)**: 检查 data 目录的访问权限

### 同步文件映射

| UTags 数据 | 潮汐收藏文件 | 说明 |
|-----------|-------------|------|
| bookmarks | collection.json | 书签数据主文件 |
| tags | tag.json | 标签定义 |
| folders | folder.json | 文件夹定义 |
| settings | info.json | 应用程序设置 |

## 时间戳说明

- **info.json**: `updateAt` 使用毫秒级时间戳
- **tag.json, collection.json, folder.json**: `createdAt`, `updatedAt` 使用秒级时间戳

## 注意事项

1. **字符编码**: 所有文件使用 UTF-8 编码
2. **数据完整性**: 标签和文件夹被删除时，需要同步更新 collection.json 中的 tagIds 和 folderId
3. **ID 生成**: 使用 nanoid 生成唯一标识符
4. **图标缓存**: icon 字段存储的是远程图标 URL，本地不缓存图标文件
