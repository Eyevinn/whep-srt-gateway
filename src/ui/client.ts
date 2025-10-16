import { Rx, RxStatus } from '../types';

let API_URL: string;

const params = new URLSearchParams(window.location.search);
const apiUrl = params.get('apiUrl');

if (apiUrl) {
  API_URL = apiUrl;
} else {
  API_URL = `${window.location.protocol}//${window.location.hostname}:${window.location.port}/api/v1/rx`;
}

export async function getAllReceivers(): Promise<Rx[]> {
  const response = await fetch(API_URL);
  if (response.ok) {
    const receivers = await response.json();
    return receivers;
  }
  return [];
}

export async function addReceiver(id: string, whepUrl: string, srtUrl: string) {
  const rxObject = {
    id: id,
    whepUrl: whepUrl,
    srtUrl: srtUrl,
    status: RxStatus.IDLE
  };
  const response = await fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify(rxObject),
    headers: {
      'Content-Type': 'application/json'
    }
  });
  if (!response.ok) {
    console.error(await response.text());
  }
}

export async function toggleState(id: string) {
  const response = await fetch(API_URL + '/' + id);
  if (response.ok) {
    const rx = await response.json();
    let newState;
    if (rx.status !== RxStatus.RUNNING) {
      newState = RxStatus.RUNNING;
    } else {
      newState = RxStatus.STOPPED;
    }
    const update = await fetch(API_URL + '/' + id + '/state', {
      method: 'PUT',
      body: JSON.stringify({
        desired: newState
      }),
      headers: {
        'Content-Type': 'application/json'
      }
    });
    if (!update.ok) {
      console.error(await response.text());
    }
  }
}

export async function removeReceiver(id: string) {
  const response = await fetch(API_URL + '/' + id, {
    method: 'DELETE'
  });
  if (!response.ok) {
    console.error(await response.text());
  }
}
