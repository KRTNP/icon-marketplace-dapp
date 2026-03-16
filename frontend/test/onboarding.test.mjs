import test from 'node:test';
import assert from 'node:assert/strict';
import { computeOnboardingState } from '../src/utils/onboarding.mjs';

test('shows connect wallet as next action when no wallet', () => {
  const view = computeOnboardingState({ hasWallet: false, hasContract: false, isLocalNetwork: false });
  assert.equal(view.nextAction, 'connect_wallet');
  assert.equal(view.steps.wallet, 'pending');
});

test('shows load contract as next action when wallet connected but contract missing', () => {
  const view = computeOnboardingState({ hasWallet: true, hasContract: false, isLocalNetwork: true });
  assert.equal(view.nextAction, 'load_contract');
  assert.equal(view.steps.wallet, 'done');
  assert.equal(view.steps.contract, 'pending');
});

test('shows ready state when wallet+contract+network are ready', () => {
  const view = computeOnboardingState({ hasWallet: true, hasContract: true, isLocalNetwork: true });
  assert.equal(view.nextAction, 'ready');
  assert.equal(view.steps.network, 'done');
  assert.equal(view.steps.contract, 'done');
});
