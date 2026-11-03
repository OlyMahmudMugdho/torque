import fs from 'fs';
import path from 'path';

const bundleDir = path.resolve('public/bundle');

const FONT_MAP = {
  // ecrm (Roman)
  'ecrm0500.tfm': 'ec-lmr5.tfm',
  'ecrm0600.tfm': 'ec-lmr6.tfm',
  'ecrm0700.tfm': 'ec-lmr7.tfm',
  'ecrm0800.tfm': 'ec-lmr8.tfm',
  'ecrm0900.tfm': 'ec-lmr9.tfm',
  'ecrm1000.tfm': 'ec-lmr10.tfm',
  'ecrm1095.tfm': 'ec-lmr10.tfm',
  'ecrm1200.tfm': 'ec-lmr12.tfm',
  'ecrm1440.tfm': 'ec-lmr12.tfm',
  'ecrm1728.tfm': 'ec-lmr17.tfm',
  'ecrm2074.tfm': 'ec-lmr17.tfm',
  'ecrm2488.tfm': 'ec-lmr17.tfm',

  // ecbx (Bold)
  'ecbx0500.tfm': 'ec-lmbx5.tfm',
  'ecbx0600.tfm': 'ec-lmbx6.tfm',
  'ecbx0700.tfm': 'ec-lmbx7.tfm',
  'ecbx0800.tfm': 'ec-lmbx8.tfm',
  'ecbx0900.tfm': 'ec-lmbx9.tfm',
  'ecbx1000.tfm': 'ec-lmbx10.tfm',
  'ecbx1095.tfm': 'ec-lmbx10.tfm',
  'ecbx1200.tfm': 'ec-lmbx12.tfm',
  'ecbx1440.tfm': 'ec-lmbx12.tfm',
  'ecbx1728.tfm': 'ec-lmbx12.tfm',
  'ecbx2074.tfm': 'ec-lmbx12.tfm',
  'ecbx2488.tfm': 'ec-lmbx12.tfm',

  // ecti (Italic)
  'ecti0500.tfm': 'ec-lmri7.tfm',
  'ecti0700.tfm': 'ec-lmri7.tfm',
  'ecti0800.tfm': 'ec-lmri8.tfm',
  'ecti0900.tfm': 'ec-lmri9.tfm',
  'ecti1000.tfm': 'ec-lmri10.tfm',
  'ecti1095.tfm': 'ec-lmri10.tfm',
  'ecti1200.tfm': 'ec-lmri12.tfm',
  'ecti1440.tfm': 'ec-lmri12.tfm',
  'ecti1728.tfm': 'ec-lmri12.tfm',
  'ecti2074.tfm': 'ec-lmri12.tfm',
  'ecti2488.tfm': 'ec-lmri12.tfm',

  // ecbi (Bold Italic)
  'ecbi0500.tfm': 'ec-lmbxi10.tfm',
  'ecbi0700.tfm': 'ec-lmbxi10.tfm',
  'ecbi0800.tfm': 'ec-lmbxi10.tfm',
  'ecbi0900.tfm': 'ec-lmbxi10.tfm',
  'ecbi1000.tfm': 'ec-lmbxi10.tfm',
  'ecbi1095.tfm': 'ec-lmbxi10.tfm',
  'ecbi1200.tfm': 'ec-lmbxi10.tfm',
  'ecbi1440.tfm': 'ec-lmbxi10.tfm',
  'ecbi1728.tfm': 'ec-lmbxi10.tfm',
  'ecbi2074.tfm': 'ec-lmbxi10.tfm',
  'ecbi2488.tfm': 'ec-lmbxi10.tfm',

  // eccc (Small Caps)
  'eccc0500.tfm': 'ec-lmcsc10.tfm',
  'eccc0600.tfm': 'ec-lmcsc10.tfm',
  'eccc0700.tfm': 'ec-lmcsc10.tfm',
  'eccc0800.tfm': 'ec-lmcsc10.tfm',
  'eccc0900.tfm': 'ec-lmcsc10.tfm',
  'eccc1000.tfm': 'ec-lmcsc10.tfm',
  'eccc1095.tfm': 'ec-lmcsc10.tfm',
  'eccc1200.tfm': 'ec-lmcsc10.tfm',
  'eccc1440.tfm': 'ec-lmcsc10.tfm',
  'eccc1728.tfm': 'ec-lmcsc10.tfm',
  'eccc2074.tfm': 'ec-lmcsc10.tfm',
  'eccc2488.tfm': 'ec-lmcsc10.tfm',

  // ecsl / ecso (Slanted)
  'ecsl0800.tfm': 'ec-lmro8.tfm',
  'ecsl0900.tfm': 'ec-lmro9.tfm',
  'ecsl1000.tfm': 'ec-lmro10.tfm',
  'ecsl1095.tfm': 'ec-lmro10.tfm',
  'ecsl1200.tfm': 'ec-lmro12.tfm',
  'ecso1000.tfm': 'ec-lmro10.tfm',

  // ecss (Sans Serif)
  'ecss0800.tfm': 'ec-lmss8.tfm',
  'ecss0900.tfm': 'ec-lmss9.tfm',
  'ecss1000.tfm': 'ec-lmss10.tfm',
  'ecss1095.tfm': 'ec-lmss10.tfm',
  'ecss1200.tfm': 'ec-lmss12.tfm',
  'ecss1728.tfm': 'ec-lmss17.tfm',
  'ecssbx10.tfm': 'ec-lmssbx10.tfm',

  // ectt (Typewriter)
  'ectt0800.tfm': 'ec-lmtt8.tfm',
  'ectt0900.tfm': 'ec-lmtt9.tfm',
  'ectt1000.tfm': 'ec-lmtt10.tfm',
  'ectt1095.tfm': 'ec-lmtt10.tfm',
  'ectt1200.tfm': 'ec-lmtt12.tfm',
};

let createdCount = 0;
for (const [targetName, sourceName] of Object.entries(FONT_MAP)) {
  const sourcePath = path.join(bundleDir, sourceName);
  const targetPath = path.join(bundleDir, targetName);
  if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, targetPath);
    createdCount++;
  } else {
    console.warn(`Source not found: ${sourceName}`);
  }
}

console.log(`Generated ${createdCount} EC TFM font files.`);

// Now refresh manifest.json
const allFiles = fs.readdirSync(bundleDir).filter((f) => f !== 'manifest.json').sort();
fs.writeFileSync(path.join(bundleDir, 'manifest.json'), JSON.stringify(allFiles, null, 2));
console.log(`Updated manifest.json with ${allFiles.length} files.`);
