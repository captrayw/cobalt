import { useEffect, useRef } from 'react';
import { useAppearance } from './appearance';
import { navigate, useRoute, type Route } from './router';
import { About } from './screens/About';
import { Dev } from './screens/Dev';
import { FeedScreen } from './screens/Feed';
import { Home } from './screens/Home';
import { MemoryScreen } from './screens/Memory';
import { SettingsScreen } from './screens/Settings';
import { Summary } from './screens/Summary';
import { useApp } from './store';

export function App() {
  useAppearance();
  const route = useRoute();
  const feed = useApp((s) => s.feed);
  const previous = useRef<Route>(route);

  useEffect(() => {
    // Leaving the feed (the back button, a typed URL) ends the running session.
    const running = useApp.getState().feed;
    if (previous.current === 'feed' && route !== 'feed' && running && running.state.status !== 'ended') running.end();
    previous.current = route;
    if (route !== 'feed') window.scrollTo(0, 0);
  }, [route]);

  useEffect(() => {
    if (route === 'feed' && !feed) navigate('home', true);
  }, [route, feed]);

  switch (route) {
    case 'feed':
      return feed ? <FeedScreen key={feed.setup.id} feed={feed} /> : null;
    case 'summary':
      return <Summary />;
    case 'memory':
      return <MemoryScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'about':
      return <About />;
    case 'dev':
      return <Dev />;
    default:
      return <Home />;
  }
}
