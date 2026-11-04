import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Release Workflow & Tauri Packaging Configuration', () => {
  const rootDir = path.resolve(__dirname, '../..');
  const workflowPath = path.join(rootDir, '.github/workflows/release.yml');
  const tauriConfPath = path.join(rootDir, 'src-tauri/tauri.conf.json');

  it('release workflow file exists and is populated', () => {
    expect(fs.existsSync(workflowPath)).toBe(true);
    const content = fs.readFileSync(workflowPath, 'utf-8');
    expect(content.length).toBeGreaterThan(100);
  });

  it('release workflow triggers on v* tags and workflow_dispatch', () => {
    const content = fs.readFileSync(workflowPath, 'utf-8');
    expect(content).toContain("tags:\n      - 'v*'");
    expect(content).toContain('workflow_dispatch:');
    expect(content).toContain('contents: write');
  });

  it('release workflow configures all target platforms (Linux, Windows, macOS)', () => {
    const content = fs.readFileSync(workflowPath, 'utf-8');
    expect(content).toContain("platform: 'ubuntu-22.04'");
    expect(content).toContain("platform: 'windows-latest'");
    expect(content).toContain("platform: 'macos-latest'");
  });

  it('release workflow configures all target binary formats', () => {
    const content = fs.readFileSync(workflowPath, 'utf-8');
    // Linux deb, rpm, appimage
    expect(content).toContain('--bundles deb,rpm,appimage');
    // Windows nsis (exe), msi
    expect(content).toContain('--bundles nsis,msi');
    // macOS dmg, app
    expect(content).toContain('--bundles dmg,app');
  });

  it('release workflow installs rpm and system dependencies on Linux', () => {
    const content = fs.readFileSync(workflowPath, 'utf-8');
    expect(content).toContain('libwebkit2gtk-4.1-dev');
    expect(content).toContain('rpm');
    expect(content).toContain('tauri-apps/tauri-action@v0');
  });

  it('tauri.conf.json defines bundle targets for deb, rpm, appimage, nsis, msi, dmg, app', () => {
    expect(fs.existsSync(tauriConfPath)).toBe(true);
    const config = JSON.parse(fs.readFileSync(tauriConfPath, 'utf-8'));
    const targets = config.bundle?.targets;

    expect(Array.isArray(targets)).toBe(true);
    expect(targets).toContain('deb');
    expect(targets).toContain('rpm');
    expect(targets).toContain('appimage');
    expect(targets).toContain('nsis');
    expect(targets).toContain('msi');
    expect(targets).toContain('dmg');
    expect(targets).toContain('app');
  });

  it('tauri.conf.json defines complete packaging metadata and OS dependencies', () => {
    const config = JSON.parse(fs.readFileSync(tauriConfPath, 'utf-8'));
    const bundle = config.bundle;

    expect(bundle.category).toBe('DeveloperTool');
    expect(bundle.shortDescription).toBeTruthy();
    expect(bundle.longDescription).toBeTruthy();
    expect(bundle.copyright).toBeTruthy();

    // Linux deb & rpm package configurations
    expect(bundle.linux?.deb?.depends).toEqual(
      expect.arrayContaining(['libwebkit2gtk-4.1-0', 'libgtk-3-0', 'librsvg2-2'])
    );
    expect(bundle.linux?.rpm?.depends).toEqual(
      expect.arrayContaining(['webkit2gtk4.1', 'gtk3', 'librsvg2'])
    );

    // Windows NSIS installer
    expect(bundle.windows?.nsis?.displayLanguageSelector).toBe(false);
  });
});
