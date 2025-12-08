import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  try {
    const listFilePath = path.join(process.cwd(), 'data', 'update-list.json');

    if (!fs.existsSync(listFilePath)) {
      return res.status(200).json([]);
    }

    const fileData = fs.readFileSync(listFilePath, 'utf8');
    const updates = JSON.parse(fileData);

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    res.status(200).json(updates);

  } catch (error) {
    console.error('Error reading updates list:', error);
    res.status(500).json({ error: 'Failed to fetch updates list' });
  }
}
