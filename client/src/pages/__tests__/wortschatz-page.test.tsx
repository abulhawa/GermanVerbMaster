/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ANDROID_B2_BERUF_VERSION } from '@shared/content-sources';
import type { WortschatzWord } from '@shared';

import { renderWortschatzPage, setupHomeNavigationTest } from './home-navigation/utils';

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
    lemma: 'Haus',
    pos: 'N',
    level: 'A1',
    english: 'house',
    exampleDe: 'Das Haus ist groß.',
    exampleEn: 'The house is large.',
    gender: 'das',
    plural: 'Häuser',
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

function installWortschatzFetch(words: WortschatzWord[], datasetVersion: string = ANDROID_B2_BERUF_VERSION) {
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
      return new Response(JSON.stringify({ providers: ['google'] }), {
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

  it('renders the Android-like default tab, countdown, search, and icon filter layout', async () => {
    const fetchMock = installWortschatzFetch(FIXTURE_WORDS);

    renderWortschatzPage();

    expect(await screen.findByRole('heading', { name: 'Wortschatz' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Schnell-Drill' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Wortliste' })).toBeInTheDocument();
    expect(screen.getByLabelText('Search vocabulary')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/wortschatz/words',
        expect.objectContaining({ credentials: 'include' }),
      );
    });

    const navigationLinks = screen.getAllByRole('link', { name: 'Wortschatz' });
    expect(navigationLinks.some((link) => link.getAttribute('aria-current') === 'page')).toBe(true);
  });

  it('filters by level, part of speech, and the Alle level chip', async () => {
    installWortschatzFetch(FIXTURE_WORDS);
    const user = userEvent.setup();

    renderWortschatzPage();

    await user.click(await screen.findByRole('tab', { name: 'Wortliste' }));

    expect(await screen.findByText('der Arbeitsvertrag')).toBeInTheDocument();
    expect(screen.queryByText('das Haus')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.click(screen.getAllByRole('button', { name: 'All' })[0]!);

    expect(await screen.findByText('das Haus')).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Verbs' }));

    const searchInput = screen.getByLabelText('Search vocabulary');
    await user.type(searchInput, 'timeline');

    expect(await screen.findByText('das Projekt')).toBeInTheDocument();
    expect(screen.queryByText(/bewerben/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Arbeitsvertrag/)).not.toBeInTheDocument();
  });

  it('renders dense grouped rows with noun article, plural, examples, and speaker controls', async () => {
    installWortschatzFetch(FIXTURE_WORDS);
    const user = userEvent.setup();

    renderWortschatzPage();

    await user.click(await screen.findByRole('tab', { name: 'Wortliste' }));

    const list = await screen.findByText('der Arbeitsvertrag');
    const row = list.closest('article');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText(/Arbeitsverträge/)).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText('Der Arbeitsvertrag ist unterschrieben.')).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText('employment contract')).toBeInTheDocument();
    expect(within(row as HTMLElement).getByLabelText('Pronounce der Arbeitsvertrag')).toBeInTheDocument();
    expect(within(row as HTMLElement).getByLabelText('Pronounce example')).toBeInTheDocument();
  });

  it('runs the flip-card flow through reveal, wrong/correct advance, completion, and restart', async () => {
    installWortschatzFetch(FIXTURE_WORDS.slice(0, 2));
    const user = userEvent.setup();

    renderWortschatzPage();

    expect(await screen.findByText('Tap to reveal')).toBeInTheDocument();

    await user.click(screen.getByText('Tap to reveal'));
    expect(await screen.findByRole('button', { name: 'Back to question' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Incorrect' }));

    await waitFor(() => {
      expect(screen.getByText('Tap to reveal')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Tap to reveal'));
    await user.click(screen.getByRole('button', { name: 'Correct' }));

    expect(await screen.findByText('Drill complete')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Restart drill' }));
    expect(await screen.findByText('Tap to reveal')).toBeInTheDocument();
  });

  it('supports swipe gestures after reveal without practice submission or history calls', async () => {
    const fetchMock = installWortschatzFetch([FIXTURE_WORDS[0]!]);

    renderWortschatzPage();

    await screen.findByText('Tap to reveal');
    fireEvent.click(screen.getByText('Tap to reveal'));

    const card = screen.getByRole('button', { name: /employment contract/i });
    fireEvent.pointerDown(card, { clientX: 10 });
    fireEvent.pointerMove(card, { clientX: 130 });
    expect(screen.getAllByText('Correct').length).toBeGreaterThan(0);
    fireEvent.pointerUp(card, { clientX: 130 });

    expect(await screen.findByText('Drill complete')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/api/submission'), expect.anything());
  });

  it('restores local tab/search/filter/drill mastery and resets mastery when the dataset changes', async () => {
    const user = userEvent.setup();

    installWortschatzFetch([FIXTURE_WORDS[0]!], 'wortschatz-v1');
    const firstRender = renderWortschatzPage();

    await screen.findByText('Tap to reveal');
    await user.click(screen.getByText('Tap to reveal'));
    await user.click(screen.getByRole('button', { name: 'Correct' }));
    await user.click(screen.getByRole('tab', { name: 'Wortliste' }));
    await user.type(screen.getByLabelText('Search vocabulary'), 'vertrag');

    firstRender.unmount();

    installWortschatzFetch([FIXTURE_WORDS[0]!], 'wortschatz-v1');
    const secondRender = renderWortschatzPage();

    expect(await screen.findByDisplayValue('vertrag')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Wortliste' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: 'Schnell-Drill' }));
    expect(await screen.findByText(/1\/1 words/)).toBeInTheDocument();

    secondRender.unmount();

    installWortschatzFetch([FIXTURE_WORDS[0]!], 'wortschatz-v2');
    renderWortschatzPage();

    expect(await screen.findByDisplayValue('vertrag')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Schnell-Drill' }));
    expect(await screen.findByText(/0\/1 words/)).toBeInTheDocument();
  });

  it('uses speech synthesis for lemma and example pronunciation actions', async () => {
    installWortschatzFetch([FIXTURE_WORDS[0]!]);
    const user = userEvent.setup();

    renderWortschatzPage();

    await user.click(await screen.findByRole('tab', { name: 'Wortliste' }));
    await user.click(screen.getByLabelText('Pronounce der Arbeitsvertrag'));
    await user.click(screen.getByLabelText('Pronounce example'));

    expect(window.speechSynthesis.cancel).toHaveBeenCalledTimes(2);
    expect(window.speechSynthesis.speak).toHaveBeenCalledTimes(2);
  });

  it('opens the mobile filter sheet on small screens', async () => {
    setViewportWidth(375);
    installWortschatzFetch(FIXTURE_WORDS);
    const user = userEvent.setup();

    renderWortschatzPage();

    await screen.findByRole('button', { name: 'Filters' });
    await user.click(screen.getByRole('button', { name: 'Filters' }));

    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('Level')).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'B2 Beruf' })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Verbs' })).toBeInTheDocument();
  });
});
