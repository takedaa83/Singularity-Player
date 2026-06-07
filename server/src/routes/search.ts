import { Router, Request, Response } from 'express';
import { SearchService } from '../services/searchService';

const router = Router();

// GET /api/search?q=...
router.get('/', async (req: Request, res: Response) => {
  const query = req.query.q as string;
  if (!query || query.trim() === '') {
    res.status(400).json({ error: 'Search query is required' });
    return;
  }

  try {
    const results = await SearchService.search(query);
    res.json(results);
  } catch (error) {
    console.error('Error handling search request:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/search/suggestions?q=...
router.get('/suggestions', async (req: Request, res: Response) => {
  const query = req.query.q as string;
  if (!query) {
    res.json([]);
    return;
  }

  try {
    const suggestions = await SearchService.getSuggestions(query);
    res.json(suggestions);
  } catch (error) {
    console.error('Error handling suggestions request:', error);
    res.json([]);
  }
});

// GET /api/search/trending
router.get('/trending', (req: Request, res: Response) => {
  try {
    const trending = SearchService.getTrendingSearches();
    res.json(trending);
  } catch (error) {
    console.error('Error handling trending request:', error);
    res.json([]);
  }
});

export default router;
