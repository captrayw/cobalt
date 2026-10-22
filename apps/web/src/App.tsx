import { useEffect, useRef } from 'react';
import { useAppearance } from './appearance';
import { inNativeApp } from './platform/native';
import { useRoute, type Route } from './router';
import { About } from './screens/About';
import { Dev } from './screens/Dev';
import { Done } from './screens/Done';
import { FeedScreen } from './screens/Feed';
import { MemoryScreen } from './screens/Memory';
import { SettingsScreen } from './screens/Settings';
import { Summary } from './screens/Summary';
import { startSession, useApp } from './store';

export function App() {
  useAppearance();
  const route = useRoute();
  const feed = useApp((s) => s.feed);
  const ready = useApp((s) => s.ready);
  const previous = useRef<Route>(route);

  useEffect(() => {
    // Leaving the feed (the back button, a typed URL) ends the running session.
    const running = useApp.getState().feed;
    if (previous.current === 'feed' && route !== 'feed' && running && running.state.status !== 'ended') running.end();
    previous.current = route;
    if (route !== 'feed') window.scrollTo(0, 0);
  }, [route]);

  // Opening the app goes straight into scrolling: a session starts as soon as storage is ready.
  // The iPhone app's web view lets sound play without a touch, so there the sound starts with it.
  // A browser plays sound only after a touch (iPhone Safari counts a tap, not a swipe), so on the
  // web the sound follows the first tap, key or swipe, and the feed shows "Tap for sound" until then.
  useEffect(() => {
    if (route === 'feed' && ready && !feed) startSession(inNativeApp);
  }, [route, ready, feed]);

  switch (route) {
    case 'feed':
      return feed ? <FeedScreen key={feed.setup.id} feed={feed} /> : <main className="feed feed-waiting" aria-label="Calm feed" />;
    case 'summary':
      return <Summary />;
    case 'done':
      return <Done />;
    case 'memory':
      return <MemoryScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'about':
      return <About />;
    case 'dev':
      return <Dev />;
  }
}
