import { useEffect, useRef } from 'react';

export const useBatchPolling = (isEnabled: boolean = true, intervalMs: number = 10 * 60 * 1000) => {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isEnabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // ポーリング関数
    const pollBatchJobs = async () => {
      try {
        const response = await fetch('/api/batch/poll', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          console.log('Batch polling completed successfully');
        } else {
          console.error('Batch polling failed:', response.statusText);
        }
      } catch (error) {
        console.error('Batch polling error:', error);
      }
    };

    // 初回実行
    pollBatchJobs();

    // 定期的なポーリングを設定
    intervalRef.current = setInterval(pollBatchJobs, intervalMs);

    // クリーンアップ
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isEnabled, intervalMs]);

  // 手動でポーリングを実行する関数
  const manualPoll = async () => {
    try {
      const response = await fetch('/api/batch/poll', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        console.log('Manual batch polling completed successfully');
        return true;
      } else {
        console.error('Manual batch polling failed:', response.statusText);
        return false;
      }
    } catch (error) {
      console.error('Manual batch polling error:', error);
      return false;
    }
  };

  return { manualPoll };
};
