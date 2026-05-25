<script lang="ts">
  /**
   * VersionSwitch - 版本切换组件
   *
   * 在页面底部显示版本切换链接，方便用户在 latest 和 release 版本间跳转。
   * 适用于部署在子目录（如 online/utags/latest/、online/utags/release/）的场景。
   *
   * 实现逻辑：
   * - 从 window.location.pathname 提取当前版本目录名
   * - 如果当前在 latest → 显示"切换到正式版" → 指向 release
   * - 如果当前在 release 或其他版本目录 → 显示"切换到最新版" → 指向 latest
   */
  import { isChineseLocale } from '../utils/i18n-utils.js'

  let currentVersionDir = $state('')

  // 在组件挂载时检测当前版本目录
  $effect(() => {
    const pathname = window.location.pathname
      .replace(/\/index\.html$/, '')
      .replace(/\/$/, '')
    const segments = pathname.split('/').filter(Boolean)
    currentVersionDir = segments[segments.length - 1] || ''

    console.log('[VersionSwitch] Current path:', pathname, 'Version dir:', currentVersionDir)
  })

  // 根据当前版本目录生成切换链接
  const switchLink = $derived(() => {
    if (currentVersionDir === 'latest') {
      return { href: '../release/index.html', text: isChineseLocale() ? '切换到正式版' : 'Switch to Release' }
    }
    if (currentVersionDir === 'release' || /^\d{8}$/.test(currentVersionDir)) {
      return { href: '../latest/index.html', text: isChineseLocale() ? '切换到最新版' : 'Switch to Latest' }
    }
    return null
  })
</script>

{#if switchLink()}
  <div class="version-switch">
    <a href={switchLink()!.href}>{switchLink()!.text}</a>
  </div>
{/if}

<style>
  .version-switch {
    position: fixed;
    bottom: 8px;
    right: 16px;
    z-index: 1000;
    font-size: 12px;
  }

  .version-switch a {
    color: #666;
    text-decoration: none;
    padding: 4px 8px;
    border-radius: 4px;
    background-color: rgba(255, 255, 255, 0.9);
    border: 1px solid #ddd;
    transition: all 0.2s ease;
  }

  .version-switch a:hover {
    color: #333;
    background-color: rgba(255, 255, 255, 1);
    border-color: #bbb;
  }

  :global(.dark) .version-switch a {
    color: #aaa;
    background-color: rgba(30, 30, 30, 0.9);
    border-color: #444;
  }

  :global(.dark) .version-switch a:hover {
    color: #fff;
    background-color: rgba(30, 30, 30, 1);
    border-color: #666;
  }
</style>
