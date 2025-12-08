import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'Update ID missing' });
  }

  try {
    const safeId = id.replace(/[^a-zA-Z0-9-_]/g, '');
    const filePath = path.join(process.cwd(), 'data', 'updates', `${safeId}.json`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Update not found' });
    }

    const fileData = fs.readFileSync(filePath, 'utf8');
    const updateJson = JSON.parse(fileData);

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.status(200).send(updateJson.content);

  } catch (error) {
    console.error('Error reading update file:', error);
    res.status(500).json({ error: 'Failed to read update content' });
  }
}
