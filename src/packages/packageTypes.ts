export type PackageCategory =
  | 'Math'
  | 'Physics'
  | 'Graphics'
  | 'Layout'
  | 'Typography'
  | 'Citations'
  | 'Code'
  | 'Tables'
  | 'General';

export const PACKAGE_CATEGORIES: PackageCategory[] = [
  'Math',
  'Physics',
  'Graphics',
  'Layout',
  'Typography',
  'Citations',
  'Code',
  'Tables',
  'General',
];

export interface LatexPackage {
  id: string;
  name: string;
  description: string;
  category: PackageCategory;
  version?: string;
  files: string[]; // e.g. ['amsmath.sty']
  isInstalled: boolean;
  source: 'bundle' | 'ctan';
  documentationUrl?: string;
}
