/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ANDROID_B2_BERUF_VERSION } from '@shared/content-sources';
import type { WortschatzWord } from '@shared';

import {
  renderWortschatzPage,
  setupHomeNavigationTest,
} from './home-navigation/utils';

const FIXTURE_WORDS: WortschatzWord[] = [
  {
    id: 1,
    lemma: 'Arbeitsvertrag',
    pos: 'N',
    level: 'B2',
    english: 'employment contract',
    exampleDe: 'Der Arbeitsvertrag ist unterschrieben.',
    exampleEn: 'The employment contract is signed.',
    gender: 'der',
    plural: 'Arbeitsverträge',
  },
  {
    id: 2,
    lemma: 'bewerben',
    pos: 'V',
    level: 'B2',
    english: 'to apply',
    exampleDe: 'Sie bewirbt sich auf die Stelle.',
    exampleEn: 'She is applying for the position.',
    gender: null,
    plural: null,
  },
  {
    id: 3,
    lemma: 'Projekt',
    pos: 'N',
    level: 'B2',
    english: 'project',
    exampleDe: 'Das Projekt braucht einen klaren Zeitplan.',
    exampleEn: 'The project needs a clear timeline.',
    gender: 'das',
    plural: 'Projekte',
  },
  {
    id: 4,
    lemma: 'zuverlässig',
    pos: 'Adj',
    level: 'B2',
    english: 'reliable',
    exampleDe: 'Sie arbeitet zuverlässig.',
    exampleEn: 'She works reliably.',
    gender: null,
    plural: null,
  },
];

function requestToUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return (input as Request).url;
}

function installWortschatzFetch(
  words: WortschatzWord[],
  datasetVersion: string = ANDROID_B2_BERUF_VERSION,
) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = requestToUrl(input);
    if (url.includes('/api/wortschatz/words')) {
      return new Response(JSON.stringify(words), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Wortschatz-Dataset-Version': datasetVersion,
        },
      });
    }

    if (url.includes('/api/auth/providers')) {
      return new Response(JSON.stringify({ providers: [] }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    throw new Error(`Unexpected request: ${url}`);
  });

  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
  return fetchMock;
}

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
}

describe('Wortschatz page', () => {
  beforeEach(() => {
    setupHomeNavigationTest();
    setViewportWidth(1280);
    window.history.replaceState({}, '', '/wortschatz');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders the dedicated route surface and marks Wortschatz navigation active', async () => {
    const fetchMock = installWortschatzFetch(FIXTURE_WORDS);

    renderWortschatzPage();

    expect(await screen.findByRole('heading', { name: 'Wortschatz' })).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/wortschatz/words',
        expect.objectContaining({ credentials: 'include' }),
      );
    });

    const navigationLinks = screen.getAllByRole('link', { name: 'Wortschatz' });
    expect(navigationLinks.some((link) => link.getAttribute('aria-current') === 'page')).toBe(true);
  });

  it('filters the word list by search query and selected parts of speech', async () => {
    installWortschatzFetch(FIXTURE_WORDS);
    const user = userEvent.setup();

    renderWortschatzPage();

    await screen.findByRole('tab', { name: 'Wortliste' });
    await user.click(screen.getByRole('tab', { name: 'Wortliste' }));

    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.click(screen.getByLabelText('Verbs'));
    await user.click(screen.getByLabelText('Adjectives'));
    await user.click(document.body);

    const searchInput = screen.getByLabelText('Search vocabulary');
    await user.type(searchInput, 'timeline');

    expect(await screen.findByRole('heading', { name: /Projekt/ })).toBeInTheDocument();
    expect(screen.queryByText(/bewerben/)).not.toBeInTheDocument();
    expect(screen.queryByText(/zuverlässig/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Arbeitsvertrag/)).not.toBeInTheDocument();
  });

  it('runs the Schnell-Drill flow through flip, result marking, completion, and restart', async () => {
    installWortschatzFetch(FIXTURE_WORDS.slice(0, 2));
    const user = userEvent.setup();

    renderWortschatzPage();

    expect(await screen.findByRole('button', { name: 'Show answer' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show answer' }));
    await user.click(screen.getByRole('button', { name: 'Correct' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Show answer' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Show answer' }));
    await user.click(screen.getByRole('button', { name: 'Incorrect' }));

    expect(await screen.findByText('Drill complete')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Restart drill' }));

    expect(await screen.findByRole('button', { name: 'Show answer' })).toBeInTheDocument();
  });

  it('restores persisted state for the same dataset version and resets drill mastery when the dataset changes', async () => {
    const user = userEvent.setup();

    installWortschatzFetch([FIXTURE_WORDS[0]!], 'wortschatz-v1');
    const firstRender = renderWortschatzPage();

    await screen.findByRole('button', { name: 'Show answer' });
    await user.click(screen.getByRole('button', { name: 'Show answer' }));
    await user.click(screen.getByRole('button', { name: 'Correct' }));
    await user.click(screen.getByRole('tab', { name: 'Wortliste' }));
    await user.type(screen.getByLabelText('Search vocabulary'), 'vertrag');

    firstRender.unmount();

    installWortschatzFetch([FIXTURE_WORDS[0]!], 'wortschatz-v1');
    const secondRender = renderWortschatzPage();

    expect(await screen.findByDisplayValue('vertrag')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Wortliste' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('1/1')).toBeInTheDocument();

    secondRender.unmount();

    installWortschatzFetch([FIXTURE_WORDS[0]!], 'wortschatz-v2');
    renderWortschatzPage();

    expect(await screen.findByDisplayValue('vertrag')).toBeInTheDocument();
    expect(await screen.findByText('0/1')).toBeInTheDocument();
  });

  it('uses speech synthesis for pronunciation actions', async () => {
    installWortschatzFetch([FIXTURE_WORDS[0]!]);
    const user = userEvent.setup();

    renderWortschatzPage();

    await screen.findByRole('button', { name: /pronounce/i });
    await user.click(screen.getByRole('button', { name: /pronounce/i }));

    expect(window.speechSynthesis.cancel).toHaveBeenCalledTimes(1);
    expect(window.speechSynthesis.speak).toHaveBeenCalledTimes(1);
  });

  it('opens the mobile filter sheet on small screens', async () => {
    setViewportWidth(375);
    installWortschatzFetch(FIXTURE_WORDS);
    const user = userEvent.setup();

    renderWortschatzPage();

    await screen.findByRole('button', { name: 'Filters' });
    await user.click(screen.getByRole('button', { name: 'Filters' }));

    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getAllByText('Part-of-speech filters').length).toBeGreaterThan(0);
    expect(within(sheet).getByLabelText('Verbs')).toBeInTheDocument();
  });
});
