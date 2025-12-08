import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  try {
    // Data folder mein rakhi hui List file ka pata lagao
    const listFilePath = path.join(process.cwd(), 'data', 'blog-list.json');

    // Agar file abhi tak bani hi nahi hai (First Run), to khali list bhejo
    if (!fs.existsSync(listFilePath)) {
      return res.status(200).json([]);
    }

    // File padho
    const fileData = fs.readFileSync(listFilePath, 'utf8');
    const blogs = JSON.parse(fileData);

    // Cache Headers (Data fast load hone ke liye)
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    res.status(200).json(blogs);

  } catch (error) {
    console.error('Error reading blog list:', error);
    res.status(500).json({ error: 'Failed to fetch blog list' });
  }
}
