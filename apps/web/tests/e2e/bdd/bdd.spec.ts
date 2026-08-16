import './steps';
import { runFeature } from './runner';

// One line per shared spec — the runner registers a Playwright test for every
// @web scenario. Mobile proves the @mobile scenarios via apps/mobile/.maestro.
runFeature('first-run.feature');
runFeature('wallet-connect.feature');
runFeature('stackr-link-pairing.feature');
