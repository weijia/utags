$tag = Read-Host 'Enter tag name (e.g., v1.0.0)'
if ([string]::IsNullOrEmpty($tag)) {
    Write-Host 'Tag name cannot be empty!'
    exit 1
}
git tag -a $tag -m "Release $tag"
Write-Host "Created tag: $tag"
git push github $tag
Write-Host "Pushed tag: $tag to github"
