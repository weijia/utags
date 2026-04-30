import fs from "node:fs"

function updateManifest(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`Skipping ${filePath} - file does not exist`)
    return
  }

  const manifest = JSON.parse(fs.readFileSync(filePath, "utf8"))

  delete manifest.web_accessible_resources

  if (manifest.content_scripts) {
    for (const script of manifest.content_scripts) {
      if (script.css && script.css.length === 0) {
        delete script.css
      }
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(manifest))
  console.log(`Updated ${filePath}`)
}

// Try to update Firefox MV2 manifest
updateManifest("build/firefox-mv2-prod/manifest.json")

// Try to update Firefox MV3 manifest
updateManifest("build/firefox-mv3-prod/manifest.json")
