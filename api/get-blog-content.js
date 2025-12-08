import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  const { id } = req.query; // URL se ID (filename) lo

  if (!id) {
    return res.status(400).json({ error: 'Blog ID missing' });
  }

  try {
    // ID saaf karo taaki koi hack na kar sake (e.g. remove slash/dots)
    const safeId = id.replace(/[^a-zA-Z0-9-_]/g, '');
    
    // Specific file dhoondho: data/blogs/filename.json
    const filePath = path.join(process.cwd(), 'data', 'blogs', `${safeId}.json`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Blog not found' });
    }

    const fileData = fs.readFileSync(filePath, 'utf8');
    const blogJson = JSON.parse(fileData);

    // Hamein sirf 'content' (markdown) wapis bhejna hai stream ki tarah
    // Taaki tumhare frontend ko lage ki ye wahi purana format hai
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.status(200).send(blogJson.content); 

  } catch (error) {
    console.error('Error reading blog file:', error);
    res.status(500).json({ error: 'Failed to read blog content' });
  }
}
