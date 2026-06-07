import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search as SearchIcon, X as CloseIcon, Clock as HistoryIcon, TrendingUp as TrendingIcon, Trash2 as DeleteIcon } from 'lucide-react';
import { useLibraryDB } from '../../hooks/useLibraryDB';
import { api } from '../../utils/api';
import { tokens } from '../../theme/muiTheme';
import { Box, Paper, List, ListItem, ListItemButton, ListItemText, IconButton, Typography, Divider, Button } from '@mui/material';

interface SearchInputProps {
  onSearch: (query: string) => void;
  initialValue?: string;
}

export const SearchInput: React.FC<SearchInputProps> = ({ onSearch, initialValue = '' }) => {
  const [query, setQuery] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [history, setHistory] = useState<{ query: string; id?: number }[]>([]);
  const [trending, setTrending] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const debounceTimerRef = useRef<number | null>(null);
  const searchDebounceRef = useRef<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const { getSearchHistory, addSearchHistoryEntry, clearSearchHistory } = useLibraryDB();

  // Sync initialValue
  useEffect(() => {
    setQuery(initialValue);
  }, [initialValue]);

  // Load search history and trending queries
  const loadDropdownData = useCallback(async () => {
    try {
      const hist = await getSearchHistory(8);
      setHistory(hist.map(h => ({ query: h.query, id: h.id })));

      const trendingRes = await fetch(`${api.baseUrl}/api/search/trending`);
      if (trendingRes.ok) {
        const trendData = await trendingRes.json();
        setTrending(trendData);
      }
    } catch (err) {
      console.error('Failed to load search context:', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadDropdownData();
  }, [loadDropdownData]);

  // Handle outside click to close dropdown
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Fetch live suggestions
  const fetchSuggestions = async (val: string) => {
    if (!val.trim() || val.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    try {
      const res = await fetch(`${api.baseUrl}/api/search/suggestions?q=${encodeURIComponent(val)}`);
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data);
      }
    } catch (e) {
      console.error('Suggestions fetch error:', e);
    }
  };

  // Debounced search trigger (Real-time searches)
  const triggerDebouncedSearch = useCallback((val: string) => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    searchDebounceRef.current = window.setTimeout(() => {
      onSearch(val.trim());
      if (val.trim()) {
        addSearchHistoryEntry(val.trim()).then(() => loadDropdownData());
      }
    }, 400);
  }, [onSearch, addSearchHistoryEntry, loadDropdownData]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setShowDropdown(true);
    setHighlightedIndex(-1);

    // Debounce suggestions fetch
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = window.setTimeout(() => {
      fetchSuggestions(val);
    }, 200);

    // Trigger real-time search
    triggerDebouncedSearch(val);
  };

  const handleSuggestionClick = (selectedQuery: string) => {
    setQuery(selectedQuery);
    setShowDropdown(false);
    onSearch(selectedQuery);
    addSearchHistoryEntry(selectedQuery).then(() => loadDropdownData());
  };

  const handleDeleteHistory = async (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    try {
      const entry = history[index];
      const db = await import('../../lib/db').then(m => m.initDB());
      if (entry.id !== undefined) {
        await db.delete('searchHistory', entry.id);
      } else {
        // Fallback: clear matches if ID missing
        const all = await db.getAll('searchHistory');
        for (const item of all) {
          if (item.query.toLowerCase() === entry.query.toLowerCase() && item.id !== undefined) {
            await db.delete('searchHistory', item.id);
          }
        }
      }
      loadDropdownData();
    } catch (err) {
      console.error('Failed to delete history entry:', err);
    }
  };

  const handleClearAllHistory = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const db = await import('../../lib/db').then(m => m.initDB());
      await db.clear('searchHistory');
      loadDropdownData();
    } catch (err) {
      console.error('Failed to clear search history:', err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const activeList = query.trim().length >= 2 ? suggestions : [...history.map(h => h.query), ...trending];
    if (!showDropdown || activeList.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => Math.min(prev + 1, activeList.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0) {
        handleSuggestionClick(activeList[highlightedIndex]);
      } else {
        handleSuggestionClick(query);
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
      setHighlightedIndex(-1);
    }
  };

  const handleClear = () => {
    setQuery('');
    setSuggestions([]);
    setShowDropdown(false);
    onSearch('');
  };

  const getDropdownItems = () => {
    if (query.trim().length >= 2) {
      return { type: 'suggestions' as const, items: suggestions };
    }
    return { type: 'history_trending' as const, history, trending };
  };

  const dropdownData = getDropdownItems();

  return (
    <Box className="relative w-full max-w-lg" ref={dropdownRef}>
      <Box component="form" onSubmit={(e) => { e.preventDefault(); handleSuggestionClick(query); }} className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => { setShowDropdown(true); setHighlightedIndex(-1); loadDropdownData(); }}
          placeholder="Search songs, artists, albums..."
          aria-label="Search input"
          aria-expanded={showDropdown}
          aria-controls="search-dropdown-list"
          role="combobox"
          className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-neutral-900 border border-neutral-700 hover:border-neutral-600 focus:border-white focus:bg-neutral-900 focus:outline-none focus:ring-1 focus:ring-white/30 text-sm text-white placeholder-neutral-500 transition-all"
        />
        <SearchIcon className="absolute left-3.5 top-3 w-4.5 h-4.5 text-neutral-400 pointer-events-none" />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear search input"
            className="absolute right-3.5 top-3 p-0.5 rounded-full hover:bg-white/15 text-neutral-400 hover:text-white transition-colors"
          >
            <CloseIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </Box>

      {/* Redesigned Floating Suggestion / Search History / Trending list */}
      {showDropdown && (
        <Paper
          id="search-dropdown-list"
          elevation={8}
          sx={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            mt: 1.5,
            bgcolor: tokens.colors.surfaceElevated,
            border: `1px solid ${tokens.colors.surfaceBorder}`,
            borderRadius: `${tokens.radius.lg}px`,
            overflow: 'hidden',
            zIndex: 100,
            backdropFilter: 'blur(20px)',
          }}
        >
          {dropdownData.type === 'suggestions' && dropdownData.items.length > 0 && (
            <List sx={{ py: 0.5 }}>
              {dropdownData.items.map((item, idx) => (
                <ListItem key={idx} disablePadding>
                  <ListItemButton
                    onClick={() => handleSuggestionClick(item)}
                    selected={idx === highlightedIndex}
                    sx={{
                      py: 1.25,
                      px: 2,
                      gap: 1.5,
                      '&.Mui-selected': { bgcolor: 'rgba(255,255,255,0.1)' },
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' },
                    }}
                  >
                    <SearchIcon size={15} color={tokens.colors.textTertiary} />
                    <Typography
                      variant="body2"
                      sx={{
                        color: tokens.colors.textPrimary,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item}
                    </Typography>
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}

          {dropdownData.type === 'history_trending' && (
            <Box>
              {/* History list */}
              {dropdownData.history.length > 0 && (
                <Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2, py: 1.5 }}>
                    <Typography variant="caption" sx={{ color: tokens.colors.textSecondary, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Recent Searches
                    </Typography>
                    <Button
                      size="small"
                      onClick={handleClearAllHistory}
                      sx={{
                        fontSize: 10,
                        color: tokens.colors.textTertiary,
                        textTransform: 'none',
                        '&:hover': { color: tokens.colors.error },
                      }}
                    >
                      Clear All
                    </Button>
                  </Box>
                  <List sx={{ py: 0 }}>
                    {dropdownData.history.map((entry, idx) => (
                      <ListItem
                        key={idx}
                        disablePadding
                        secondaryAction={
                          <IconButton
                            edge="end"
                            aria-label="Delete history entry"
                            onClick={(e) => handleDeleteHistory(e, idx)}
                            sx={{ color: tokens.colors.textTertiary, mr: 1, '&:hover': { color: tokens.colors.error } }}
                          >
                            <DeleteIcon size={14} />
                          </IconButton>
                        }
                      >
                        <ListItemButton
                          onClick={() => handleSuggestionClick(entry.query)}
                          selected={idx === highlightedIndex}
                          sx={{
                            py: 1,
                            px: 2,
                            gap: 1.5,
                            '&.Mui-selected': { bgcolor: 'rgba(255,255,255,0.1)' },
                            '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' },
                          }}
                        >
                          <HistoryIcon size={14} color={tokens.colors.textTertiary} />
                          <Typography
                            variant="body2"
                            sx={{
                              color: tokens.colors.textPrimary,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {entry.query}
                          </Typography>
                        </ListItemButton>
                      </ListItem>
                    ))}
                  </List>
                  {dropdownData.trending.length > 0 && <Divider sx={{ my: 0.5, borderColor: tokens.colors.surfaceBorder }} />}
                </Box>
              )}

              {/* Trending searches */}
              {dropdownData.trending.length > 0 && (
                <Box>
                  <Box sx={{ px: 2, py: 1.5 }}>
                    <Typography variant="caption" sx={{ color: tokens.colors.textSecondary, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Trending Searches
                    </Typography>
                  </Box>
                  <List sx={{ py: 0 }}>
                    {dropdownData.trending.map((trend, idx) => {
                      const offsetIdx = dropdownData.history.length + idx;
                      return (
                        <ListItem key={idx} disablePadding>
                          <ListItemButton
                            onClick={() => handleSuggestionClick(trend)}
                            selected={offsetIdx === highlightedIndex}
                            sx={{
                              py: 1,
                              px: 2,
                              gap: 1.5,
                              '&.Mui-selected': { bgcolor: 'rgba(255,255,255,0.1)' },
                              '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' },
                            }}
                          >
                            <TrendingIcon size={14} color={tokens.colors.primary} />
                            <Typography
                              variant="body2"
                              sx={{
                                color: tokens.colors.textPrimary,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {trend}
                            </Typography>
                          </ListItemButton>
                        </ListItem>
                      );
                    })}
                  </List>
                </Box>
              )}
            </Box>
          )}
        </Paper>
      )}
    </Box>
  );
};

export default SearchInput;
