#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const DEFAULT_STORE_PATH = 'logs/fact-store-dev.json';
const DEFAULT_MODEL = 'openrouter/free';
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_MAX_STORED_FACTS = 20000;
const DEFAULT_MAX_TOKENS_PER_FACT = 80;
const DEFAULT_BATCH_MAX_ATTEMPTS = 3;
const DEFAULT_FILL_MAX_CONSECUTIVE_FAILURES = 6;
const FACT_MIN_LENGTH = 15;
const FACT_MAX_LENGTH = 220;

function getOpenRouterMaxTokens(count) {
  return Math.min(1200, Math.max(120, count * DEFAULT_MAX_TOKENS_PER_FACT));
}

function buildOpenRouterFactRequest({ count, model, batchId }) {
  return {
    model,
    max_tokens: getOpenRouterMaxTokens(count),
    temperature: 0.8,
    presence_penalty: 0.6,
    frequency_penalty: 0.8,
    messages: [
      {
        role: 'system',
        content: `You are a fact-bot. Generate exactly ${count} unique, surprising fun facts or productivity tips.
Keep each under 180 characters.
Do not repeat common examples like honey, octopuses, bananas, Venus, wombats, or Pomodoro.
End every fact with a period.
Format: Return ONLY the facts, one per line, no numbers.`
      },
      {
        role: 'user',
        content: `Give me a fresh batch of facts and tips. Batch nonce: ${batchId}. Prefer obscure science, history, language, craft, food, design, and productivity facts.`
      }
    ]
  };
}

function parseArgs(argv) {
  const args = {
    command: argv[2] || 'status',
    options: {}
  };

  for (let index = 3; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;

    const [rawKey, inlineValue] = arg.slice(2).split('=', 2);
    const nextValue = argv[index + 1];
    if (inlineValue !== undefined) {
      args.options[rawKey] = inlineValue;
    } else if (nextValue && !nextValue.startsWith('--')) {
      args.options[rawKey] = nextValue;
      index += 1;
    } else {
      args.options[rawKey] = true;
    }
  }

  return args;
}

function readDotEnv() {
  const envPath = resolve('.env');
  if (!existsSync(envPath)) return {};

  const env = {};
  const contents = readFileSync(envPath, 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function getOpenRouterKey(options) {
  const dotEnv = readDotEnv();
  return (
    options.key ||
    process.env.OPENROUTER_API_KEY ||
    process.env.OPENROUTER_KEY ||
    dotEnv.OPENROUTER_API_KEY ||
    dotEnv.OPENROUTER_KEY ||
    dotEnv.openRouterKey ||
    dotEnv.OPENROUTER_TOKEN
  );
}

function getNumber(value, fallback) {
  if (value === undefined || value === true) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getStorePath(options) {
  return resolve(String(options.store || DEFAULT_STORE_PATH));
}

function loadStore(storePath) {
  if (!existsSync(storePath)) {
    return {
      storedFacts: [],
      factDebug: {},
      lastRotationDate: 0
    };
  }

  return JSON.parse(readFileSync(storePath, 'utf8'));
}

function saveStore(storePath, store) {
  mkdirSync(dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify(store, null, 2)}\n`);
}

function getFactPreview(item) {
  if (!item) return null;
  return {
    type: item.type || 'Unknown',
    content: item.content || '',
    source: item.source || 'unknown',
    added: item.added || null,
    model: item.model || null,
    batchId: item.batchId || null
  };
}

function normalizeFactContent(content) {
  return String(content || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isLikelyCompleteFact(content) {
  const trimmed = String(content || '').trim();
  if (trimmed.length < FACT_MIN_LENGTH || trimmed.length > FACT_MAX_LENGTH) return false;
  if (!/[.!?]["')\]]?$/.test(trimmed)) return false;
  return true;
}

function summarizeFactLibrary(storedFacts = []) {
  const summary = {
    total: storedFacts.length,
    openrouter: 0,
    legacy: 0,
    unknown: 0,
    newest: null,
    oldest: null,
    recent: storedFacts.slice(-5).reverse().map(getFactPreview)
  };

  for (const item of storedFacts) {
    if (item.source === 'openrouter') summary.openrouter += 1;
    else if (item.source === 'legacy-cache') summary.legacy += 1;
    else summary.unknown += 1;

    if (item.added) {
      if (!summary.newest || item.added > summary.newest) summary.newest = item.added;
      if (!summary.oldest || item.added < summary.oldest) summary.oldest = item.added;
    }
  }

  return summary;
}

function parseOpenRouterFacts(content, { model, batchId, now }) {
  return content
    .trim()
    .split('\n')
    .map((line) => line.trim().replace(/^[0-9.-]+\s+/, ''))
    .filter(isLikelyCompleteFact)
    .map((line, index) => ({
      type: index % 2 === 0 ? 'AI Fact' : 'AI Tip',
      content: line,
      source: 'openrouter',
      model,
      batchId,
      added: now
    }));
}

function filterNewFactsForLibrary(existingFacts, candidateFacts) {
  const seen = new Set((existingFacts || []).map((item) => normalizeFactContent(item.content)));
  const kept = [];
  const duplicates = [];

  for (const item of candidateFacts) {
    const key = normalizeFactContent(item.content);
    if (!key || seen.has(key)) {
      duplicates.push(item);
      continue;
    }

    seen.add(key);
    kept.push(item);
  }

  return { kept, duplicates };
}

function pruneFactLibrary(library) {
  const seen = new Set();
  const kept = [];
  const removed = [];

  for (const item of library || []) {
    const key = normalizeFactContent(item.content);
    if (!key || !isLikelyCompleteFact(item.content) || seen.has(key)) {
      removed.push(item);
      continue;
    }

    seen.add(key);
    kept.push(item);
  }

  return { kept, removed };
}

function getOpenRouterChoiceContent(result) {
  const choice = result?.choices?.[0];
  if (!choice) {
    throw new Error('OpenRouter response did not include choices[0]');
  }

  const content = choice.message?.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error(`OpenRouter returned empty content (finish_reason: ${choice.finish_reason || 'unknown'}, model: ${result.model || 'unknown'})`);
  }

  return content;
}

async function fetchOpenRouterFactBatch({ key, count, model, timeoutMs, batchId, now }) {
  let lastError = null;
  for (let attempt = 1; attempt <= DEFAULT_BATCH_MAX_ATTEMPTS; attempt += 1) {
    try {
      const items = await fetchOpenRouterFactBatchOnce({ key, count, model, timeoutMs, batchId, now });
      console.log(`[facts] batch succeeded on attempt ${attempt}/${DEFAULT_BATCH_MAX_ATTEMPTS}`);
      return items;
    } catch (error) {
      lastError = error;
      console.log(`[facts] batch attempt ${attempt}/${DEFAULT_BATCH_MAX_ATTEMPTS} failed: ${error.message}`);
    }
  }

  throw lastError || new Error('OpenRouter batch failed without an error');
}

async function fetchOpenRouterFactBatchOnce({ key, count, model, timeoutMs, batchId, now }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'HTTP-Referer': 'https://github.com/codengod/admute',
        'X-Title': 'AdMute Local Fact Harness',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(buildOpenRouterFactRequest({ count, model, batchId }))
    });

    const body = await response.text();
    if (!response.ok) {
      throw new Error(`OpenRouter ${response.status}: ${body.slice(0, 300)}`);
    }

    const result = JSON.parse(body);
    const content = getOpenRouterChoiceContent(result);
    const items = parseOpenRouterFacts(content, { model, batchId, now });
    if (items.length === 0) {
      throw new Error(`OpenRouter returned content but no usable facts (finish_reason: ${result.choices[0].finish_reason || 'unknown'}, model: ${result.model || model})`);
    }

    return items;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`OpenRouter request timed out after ${timeoutMs / 1000}s`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function appendFactsToLibrary(store, newFacts, maxStoredFacts) {
  let updatedLibrary = [...(store.storedFacts || []), ...newFacts];
  if (updatedLibrary.length > maxStoredFacts) {
    updatedLibrary = updatedLibrary.slice(-maxStoredFacts);
  }

  return {
    ...store,
    storedFacts: updatedLibrary
  };
}

async function fillStore(options) {
  const storePath = getStorePath(options);
  const key = getOpenRouterKey(options);
  if (!key) {
    throw new Error('Missing OpenRouter key. Set OPENROUTER_API_KEY, OPENROUTER_KEY, or pass --key.');
  }

  const target = getNumber(options.target, 1000);
  const batchSize = getNumber(options['batch-size'], DEFAULT_BATCH_SIZE);
  const timeoutMs = getNumber(options.timeout, DEFAULT_TIMEOUT_MS);
  const maxStoredFacts = getNumber(options.max, DEFAULT_MAX_STORED_FACTS);
  const model = String(options.model || DEFAULT_MODEL);
  const now = Date.now();
  let store = loadStore(storePath);
  const prunedLibrary = pruneFactLibrary(store.storedFacts || []);
  if (prunedLibrary.removed.length > 0) {
    store = {
      ...store,
      storedFacts: prunedLibrary.kept,
      factDebug: {
        ...(store.factDebug || {}),
        lastPruneAt: Date.now(),
        lastPruneRemoved: prunedLibrary.removed.length,
        lastPruneLibrarySize: prunedLibrary.kept.length
      }
    };
    saveStore(storePath, store);
    console.log(`[facts] pruned ${prunedLibrary.removed.length} duplicate/incomplete facts; library now ${prunedLibrary.kept.length}`);
  }
  const initialCount = store.storedFacts?.length || 0;
  const targetNewFacts = Math.max(0, target - initialCount);
  const fetchedFacts = [];
  let failedBatchCount = 0;
  let consecutiveBatchFailures = 0;
  let skippedDuplicateCount = 0;

  store.factDebug = {
    ...(store.factDebug || {}),
    lastFetchStartedAt: now,
    lastFetchStatus: targetNewFacts > 0 ? 'running' : 'library-fresh',
    lastFetchError: null,
    lastFetchModel: model,
    lastFetchTarget: targetNewFacts,
    lastFetchLibrarySize: initialCount,
    lastFetchFailedBatches: 0,
    lastFetchConsecutiveFailures: 0
  };
  saveStore(storePath, store);

  if (targetNewFacts === 0) {
    return store;
  }

  try {
    let batchSequence = 0;
    while (fetchedFacts.length < targetNewFacts) {
      batchSequence += 1;
      const remaining = targetNewFacts - fetchedFacts.length;
      const requestedCount = Math.min(batchSize, remaining);
      const batchId = `local-${now}-${batchSequence}`;
      const startedAt = Date.now();

      console.log(`[facts] requesting ${requestedCount}; progress ${fetchedFacts.length}/${targetNewFacts}; batch ${batchId}`);
      try {
        const batchItems = await fetchOpenRouterFactBatch({
          key,
          count: requestedCount,
          model,
          timeoutMs,
          batchId,
          now
        });

        if (batchItems.length === 0) {
          throw new Error('OpenRouter returned an empty fact batch');
        }

        const { kept, duplicates } = filterNewFactsForLibrary(store.storedFacts || [], batchItems);
        if (kept.length === 0) {
          throw new Error(`OpenRouter returned no new unique complete facts for ${batchId} (${duplicates.length} duplicates skipped)`);
        }

        consecutiveBatchFailures = 0;
        skippedDuplicateCount += duplicates.length;
        fetchedFacts.push(...kept);
        store = appendFactsToLibrary(store, kept, maxStoredFacts);
        store.factDebug = {
          ...(store.factDebug || {}),
          lastFetchStatus: 'running',
          lastFetchCount: fetchedFacts.length,
          lastFetchTarget: targetNewFacts,
          lastFetchBatchId: batchId,
          lastFetchBatchRequested: requestedCount,
          lastFetchBatchReceived: kept.length,
          lastFetchBatchRawReceived: batchItems.length,
          lastFetchBatchSkippedDuplicates: duplicates.length,
          lastFetchSkippedDuplicates: skippedDuplicateCount,
          lastFetchBatchDurationMs: Date.now() - startedAt,
          lastFetchBatchCompletedAt: Date.now(),
          lastFetchLibrarySize: store.storedFacts.length,
          lastFetchBatchError: null,
          lastFetchFailedBatches: failedBatchCount,
          lastFetchConsecutiveFailures: consecutiveBatchFailures,
          lastFetchPreview: kept.slice(0, 3).map(getFactPreview)
        };
        saveStore(storePath, store);
        console.log(`[facts] stored ${store.storedFacts.length}; kept ${kept.length}/${batchItems.length}; skipped ${duplicates.length}`);
      } catch (batchError) {
        failedBatchCount += 1;
        consecutiveBatchFailures += 1;
        store.factDebug = {
          ...(store.factDebug || {}),
          lastFetchStatus: 'running',
          lastFetchCount: fetchedFacts.length,
          lastFetchTarget: targetNewFacts,
          lastFetchBatchId: batchId,
          lastFetchBatchRequested: requestedCount,
          lastFetchBatchDurationMs: Date.now() - startedAt,
          lastFetchBatchCompletedAt: Date.now(),
          lastFetchLibrarySize: store.storedFacts.length,
          lastFetchBatchError: batchError.message,
          lastFetchFailedBatches: failedBatchCount,
          lastFetchConsecutiveFailures: consecutiveBatchFailures
        };
        saveStore(storePath, store);
        console.log(`[facts] skipping failed batch ${batchId}: ${batchError.message}`);

        if (consecutiveBatchFailures >= DEFAULT_FILL_MAX_CONSECUTIVE_FAILURES) {
          throw new Error(`OpenRouter failed ${consecutiveBatchFailures} consecutive fact batches; last error: ${batchError.message}`);
        }
      }
    }

    store.lastRotationDate = now;
    store.factDebug = {
      ...(store.factDebug || {}),
      lastFetchCompletedAt: Date.now(),
      lastFetchStatus: 'success',
      lastFetchCount: fetchedFacts.length,
      lastFetchTarget: targetNewFacts,
      lastFetchLibrarySize: store.storedFacts.length,
      lastFetchFailedBatches: failedBatchCount,
      lastFetchConsecutiveFailures: consecutiveBatchFailures,
      lastFetchSkippedDuplicates: skippedDuplicateCount,
      lastFetchError: null
    };
    saveStore(storePath, store);
    return store;
  } catch (error) {
    store.factDebug = {
      ...(store.factDebug || {}),
      lastFetchCompletedAt: Date.now(),
      lastFetchStatus: fetchedFacts.length > 0 ? 'partial-error' : 'error',
      lastFetchCount: fetchedFacts.length,
      lastFetchTarget: targetNewFacts,
      lastFetchLibrarySize: store.storedFacts.length,
      lastFetchFailedBatches: failedBatchCount,
      lastFetchConsecutiveFailures: consecutiveBatchFailures,
      lastFetchSkippedDuplicates: skippedDuplicateCount,
      lastFetchError: error.message
    };
    saveStore(storePath, store);
    throw error;
  }
}

function serveFact(options) {
  const storePath = getStorePath(options);
  const store = loadStore(storePath);
  const library = store.storedFacts || [];

  if (library.length === 0) {
    return {
      item: null,
      lastServedFact: {
        type: 'no-stored-fact',
        content: 'Stored fact library is empty.',
        source: 'empty-store',
        servedAt: Date.now(),
        librarySize: 0
      },
      store
    };
  }

  const randomIndex = Math.floor(Math.random() * library.length);
  const item = library[randomIndex];
  const lastServedFact = {
    ...getFactPreview(item),
    servedAt: Date.now(),
    libraryIndex: randomIndex,
    librarySize: library.length
  };
  store.lastServedFact = lastServedFact;
  saveStore(storePath, store);

  return { item, lastServedFact, store };
}

function printUsage() {
  console.log(`Usage:
  node scripts/fact-library-harness.mjs status [--store logs/fact-store-dev.json]
  node scripts/fact-library-harness.mjs fill [--target 1000] [--batch-size 25] [--timeout 30000] [--model openrouter/free]
  node scripts/fact-library-harness.mjs serve
  node scripts/fact-library-harness.mjs clear

Key lookup:
  OPENROUTER_API_KEY, OPENROUTER_KEY, .env OPENROUTER_API_KEY, .env OPENROUTER_KEY, .env openRouterKey, or --key
`);
}

async function main() {
  const { command, options } = parseArgs(process.argv);
  const storePath = getStorePath(options);

  if (command === 'help' || options.help) {
    printUsage();
    return;
  }

  if (command === 'status') {
    const store = loadStore(storePath);
    console.log(JSON.stringify({
      storePath,
      hasOpenRouterKey: Boolean(getOpenRouterKey(options)),
      policy: {
        defaultModel: DEFAULT_MODEL,
        defaultBatchSize: DEFAULT_BATCH_SIZE,
        maxStoredFacts: DEFAULT_MAX_STORED_FACTS,
        maxConsecutiveBatchFailures: DEFAULT_FILL_MAX_CONSECUTIVE_FAILURES
      },
      library: summarizeFactLibrary(store.storedFacts || []),
      factDebug: store.factDebug || {},
      lastServedFact: store.lastServedFact || null
    }, null, 2));
    return;
  }

  if (command === 'fill') {
    const store = await fillStore(options);
    console.log(JSON.stringify({
      storePath,
      library: summarizeFactLibrary(store.storedFacts || []),
      factDebug: store.factDebug || {}
    }, null, 2));
    return;
  }

  if (command === 'serve') {
    const result = serveFact(options);
    console.log(JSON.stringify({
      storePath,
      item: result.item,
      lastServedFact: result.lastServedFact,
      library: summarizeFactLibrary(result.store.storedFacts || [])
    }, null, 2));
    return;
  }

  if (command === 'clear') {
    saveStore(storePath, {
      storedFacts: [],
      factDebug: {
        lastClearAt: Date.now(),
        lastFetchStatus: 'cleared'
      },
      lastRotationDate: 0,
      lastServedFact: null
    });
    console.log(`Cleared ${storePath}`);
    return;
  }

  printUsage();
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[facts] ${error.message}`);
  process.exitCode = 1;
});
