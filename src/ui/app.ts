import * as client from './client';

const POLL_INTERVAL = 1000; // Poll every 1 second

async function generateNextId(): Promise<string> {
  const receivers = await client.getAllReceivers();
  const existingIds = new Set(receivers.map((rx) => rx.id));

  // Find the next available integer starting from 1
  let index = 1;
  while (existingIds.has(`rx-${index}`)) {
    index++;
  }

  return `rx-${index}`;
}

// Track existing receivers to avoid duplicate event listeners
const existingReceivers = new Set<string>();

async function updateReceivers() {
  const receiverSection = document.querySelector('#receivers');
  if (!receiverSection) return;

  const receivers = await client.getAllReceivers();
  const currentReceiverIds = new Set(receivers.map((rx) => rx.id));

  // Remove receivers that no longer exist
  existingReceivers.forEach((id) => {
    if (!currentReceiverIds.has(id)) {
      const elementId = 'rx-' + id;
      const element = document.getElementById(elementId);
      if (element) {
        receiverSection.removeChild(element);
      }
      existingReceivers.delete(id);
    }
  });

  // Update or create receivers
  receivers.forEach((rx) => {
    const elementId = 'rx-' + rx.id;
    let element = document.getElementById(elementId) as HTMLButtonElement | null;

    if (!element) {
      // Create new receiver element
      element = document.createElement('button');
      element.id = elementId;
      receiverSection.appendChild(element);
      existingReceivers.add(rx.id);

      // Add click handler for toggling state (only once)
      element.addEventListener('click', async (event) => {
        const target = event.target as HTMLElement;
        // Don't toggle if clicking on remove button
        if (target.classList.contains('remove')) return;

        const btn = event.currentTarget as HTMLButtonElement;
        const id = btn.id.replace('rx-', '');
        await client.toggleState(id);
        await updateReceivers();
      });
    }

    // Update content (always update to reflect status changes)
    const isLongId = rx.id.length > 10;
    element.innerHTML =
      `<span class="rxId" data-long="${isLongId}">${rx.id}</span><br>` +
      `<a class="whepUrl" href="${rx.whepUrl}">WHEP</a><br>` +
      `<a class="srtUrl" href="${rx.srtUrl}">SRT</a>` +
      `<p class="state">${rx.status}</p>`;
    element.className = rx.status;

    // Re-add remove button (since innerHTML wipes it)
    const removeBtn = document.createElement('a');
    removeBtn.className = 'remove';
    removeBtn.innerHTML = 'X';
    element.appendChild(removeBtn);

    removeBtn.addEventListener('click', async (event) => {
      event.stopPropagation();
      const btn = <HTMLAnchorElement>event.target;
      const rxElement = <HTMLButtonElement>btn.parentElement;
      const id = rxElement.id.replace('rx-', '');
      try {
        await client.removeReceiver(id);
        await updateReceivers();
      } catch (error) {
        console.error('Failed to remove receiver:', error);
        // Update will happen on next poll
      }
    });
  });
}

window.addEventListener('DOMContentLoaded', async () => {
  // Initial update
  await updateReceivers();

  // Start polling for updates
  setInterval(async () => {
    await updateReceivers();
  }, POLL_INTERVAL);

  // Generate initial ID
  const rxIdInput = document.querySelector<HTMLInputElement>('#newRxId');
  if (!rxIdInput) return;
  rxIdInput.value = await generateNextId();

  const addReceiverButton = document.querySelector<HTMLButtonElement>('#addReceiver');
  if (!addReceiverButton) return;

  addReceiverButton.addEventListener('click', async () => {
    const rxIdElem = document.querySelector<HTMLInputElement>('#newRxId');
    const whepUrlElem = document.querySelector<HTMLInputElement>('#newWhepUrl');
    const srtUrlElem = document.querySelector<HTMLInputElement>('#srtOutputUrl');

    if (!rxIdElem || !whepUrlElem || !srtUrlElem) return;

    let rxId = rxIdElem.value.trim();
    const whepUrl = whepUrlElem.value;
    const srtUrl = srtUrlElem.value;

    // Generate next ID if empty
    if (!rxId) {
      rxId = await generateNextId();
    }

    await client.addReceiver(rxId, whepUrl, srtUrl);

    // Generate new ID for next receiver
    rxIdElem.value = await generateNextId();

    await updateReceivers();
  });
});
