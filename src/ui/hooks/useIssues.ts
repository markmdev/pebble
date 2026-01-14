import { useState, useEffect, useCallback, useRef } from 'react';
import type { Issue, IssueEvent } from '../../shared/types';
import { fetchIssues, fetchEvents } from '../lib/api';

interface UseIssuesResult {
  issues: Issue[];
  events: IssueEvent[];
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useIssues(): UseIssuesResult {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [events, setEvents] = useState<IssueEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [issuesData, eventsData] = await Promise.all([
        fetchIssues(),
        fetchEvents(),
      ]);
      setIssues(issuesData);
      setEvents(eventsData);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // SSE subscription for real-time updates
  useEffect(() => {
    // Create EventSource connection
    const eventSource = new EventSource('/api/events/stream');
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'change') {
          // Refresh data when file changes
          loadData();
        }
      } catch {
        // Ignore parse errors
      }
    };

    eventSource.onerror = () => {
      // Reconnection is handled automatically by EventSource
      // Just log for debugging if needed
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [loadData]);

  return { issues, events, loading, error, refresh: loadData };
}
