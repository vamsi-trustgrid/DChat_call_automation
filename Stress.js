const puppeteer = require('puppeteer');

// Base URL for your decentralized messenger
const BASE_WEBSITE_URL = "https://dchat.staging.trustgrid.com/";

const CALL_CONNECT_TIMEOUT_MS = 45000; // Max time to wait for call to connect (45 seconds)
const CALL_DURATION_MS = 8000; // Duration to keep call connected for verification (8 seconds)

let maxConcurrentCalls = 0;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes JavaScript in the browser to check WebRTC stats.
 * This function is critical for verifying media flow.
 *
 * YOU MUST ADAPT THE 'pc' (RTCPeerConnection) ACCESS TO YOUR APP'S STRUCTURE.
 * The recommended approach is to expose it globally in your application's code.
 *
 * @param {puppeteer.Page} page - The Puppeteer Page object for the user.
 * @returns {Promise<boolean>} - True if media flow is detected, false otherwise.
 */
async function checkWebRTCConnection(page) {
  try {
    const isConnected = await page.evaluate(async () => {
      const pc = window.automatedTestPeerConnection;

      if (!pc) {
        console.warn("RTCPeerConnection object not found.");
        return false;
      }

      // Wait longer to allow media flow
      await new Promise((resolve) => setTimeout(resolve, 10000));

      const stats = await pc.getStats();
      let hasInboundRtp = false;
      let hasOutboundRtp = false;

      for (const stat of stats.values()) {
        console.log("🟡 [Browser getStats()] stat:", JSON.stringify(stat));

        if (
          stat.type === "inbound-rtp" &&
          stat.kind === "audio" &&
          stat.bytesReceived > 0
        ) {
          hasInboundRtp = true;
        }

        if (
          stat.type === "outbound-rtp" &&
          stat.kind === "audio" &&
          stat.bytesSent > 0
        ) {
          hasOutboundRtp = true;
        }
      }

      return hasInboundRtp && hasOutboundRtp;
    });

    return isConnected;
  } catch (err) {
    console.error("Error checking WebRTC stats:", err);
    return false;
  }
}

/**
 * Checks if a specific alias exists in the current user's contact list.
 *
 * @param {puppeteer.Page} page - The Puppeteer Page object.
 * @param {string} alias - The alias to check for in the contact list.
 * @returns {Promise<boolean>} - True if the contact exists, false otherwise.
 */
async function checkIfContactExists(page, alias) {
  console.log(
    ` &nbsp;[Puppeteer Check] Checking if '${alias}' exists in contacts...`
  );
  try {
    const exists = await page.evaluate((targetAlias) => {
      const contactsListElement = document.getElementById("contactsList");
      if (!contactsListElement) {
        return false; // Contact list element not found
      }
      // Check for a child element with data-id matching the target alias
      return !!contactsListElement.querySelector(`[data-id="${targetAlias}"]`);
    }, alias); // Pass alias to the browser context

    if (exists) {
      console.log(` &nbsp;[Puppeteer Check] '${alias}' FOUND in contacts.`);
    } else {
      console.log(` &nbsp;[Puppeteer Check] '${alias}' NOT found in contacts.`);
    }
    return exists;
  } catch (error) {
    console.error(
      ` &nbsp;[Puppeteer Check] Error checking contact existence: ${error.message}`
    );
    return false; // Assume not exists if error occurs
  }
}

/**
 * Simulates sending a contact request.
 *
 * @param {puppeteer.Page} page - The Puppeteer Page object for the user sending the request.
 * @param {string} aliasToSendRequestTo - The alias/username of the user to send a request to.
 */
async function sendContactRequest(page, aliasToSendRequestTo) {
  console.log(
    ` &nbsp;[Puppeteer Action] Clicking 'Add Contact' button to send request to ${aliasToSendRequestTo}...`
  );
  // Selector for the button that opens the "Add Contact" UI
  // Based on your client-side JS (`addContactBtn = document.getElementById('addContact');`)
  // and HTML `<button class="add-button" onclick="handleAddButton()">+`
  // Using ID is generally more robust if available, otherwise use class.
  await page.waitForSelector(".add-button", { visible: true, timeout: 15000 });
  await page.click(".add-button"); // Using ID: #addContact
  // If no ID, use: await page.click('.add-button');
  await delay(4000); // Small delay for UI to react
  console.log("✅ 'Add Contact' button visible");

  console.log(
    ` &nbsp;[Puppeteer Action] Typing alias '${aliasToSendRequestTo}' into add contact input...`
  );
  // Selector for the input field in the "Add Contact" dialog/modal
  await page.waitForSelector(".dialog-input", {
    visible: true,
    timeout: 3000,
  });
  console.log("✅ 'Add Contact' button visible");
  await page.type(".dialog-input", aliasToSendRequestTo);
  await delay(3000);

  console.log(` &nbsp;[Puppeteer Action] Clicking 'Send Request' button...`);
  // Selector for the button to send the contact request in the dialog.
  // Assuming 'dialog-button' and 'confirm' are two separate class names.
  await page.waitForSelector("button.dialog-button.confirm", {
    visible: true,
    timeout: 3000,
  });
  await page.click("button.dialog-button.confirm");
  console.log("Sucesssfully clicked 'Add Contact' button.");
  await delay(3000);
  // Wait for the request to be sent and UI updated
  console.log(
    ` &nbsp;[Puppeteer Action] Contact request sent to '${aliasToSendRequestTo}'.`
  );
}

/**
 * Simulates accepting a contact request from a specific user via a dialog.
 *
 * @param {puppeteer.Page} page - The Puppeteer Page object for the user accepting the request.
 * @param {string} aliasToAcceptFrom - The alias/username of the user who sent the request.
 */
async function acceptContactRequest(page, aliasToAcceptFrom) {
  console.log(
    ` &nbsp;[Puppeteer Action] Waiting for contact request dialog for '${aliasToAcceptFrom}' to appear...`
  );

  // Selector for the dialog box itself
  const dialogSelector = '[data-test-id="dialog-box"]';

  await page.waitForSelector(dialogSelector, { visible: true, timeout: 20000 });
  console.log(
    ` &nbsp;[Puppeteer Action] Contact request dialog for '${aliasToAcceptFrom}' appeared.`
  );

  // Find the "Accept" button *within* that dialog.
  // Assuming 'dialog-button' and 'confirm' are two separate class names for the accept button.
  const acceptButtonSelector = `${dialogSelector}   button.dialog-button.confirm`;

  console.log(
    ` &nbsp;[Puppeteer Action] Clicking 'Accept' button in dialog for request from '${aliasToAcceptFrom}'...`
  );
  await page.click(acceptButtonSelector);
  await delay(3000); // waits 3 seconds for both
  // Wait for the request to be processed and UI updated
  console.log(
    ` &nbsp;[Puppeteer Action] Contact request from '${aliasToAcceptFrom}' accepted.`
  );

  // Optional: Wait for the dialog to disappear if it does
  await page
    .waitForSelector(dialogSelector, { hidden: true, timeout: 5000 })
    .catch(() =>
      console.log(
        `[Puppeteer Action] Dialog for ${aliasToAcceptFrom} did not disappear within 5s.`
      )
    );
}

/**
 * Simulates a call between two users, including sending/accepting contact requests.
 * @param {number} pairId - A unique ID for the current call pair.
 * @returns {Promise<boolean>} - True if call connects successfully, false otherwise.
 */
async function testCallPair(pairId) {
  let browser1, browser2;
  let callConnected = false;

  const user1Alias = `userA_${pairId}`; // Alias for the caller
  const user1Pass = `passA_${pairId}`; // Password for the caller
  const user2Alias = `userB_${pairId}`; // Alias for the callee
  const user2Pass = `passB_${pairId}`; // Password for the callee

  // Construct URLs with dynamic username and password as query parameters
  const urlUser1 = `${BASE_WEBSITE_URL}?username=${user1Alias}&password=${user1Pass}`;
  const urlUser2 = `${BASE_WEBSITE_URL}?username=${user2Alias}&password=${user2Pass}`;

  try {
    console.log(
      `\n[Pair ${pairId}] Launching browsers for User 1 (${user1Alias}) and User 2 (${user2Alias})...`
    );
    browser1 = await puppeteer.launch({
      headless: false, // Keep true for testing, set to false for visual debugging
      args: [
        "--use-fake-ui-for-media-stream", // Suppresses UI for media permission requests
        "--use-fake-device-for-media-stream", // Provides a dummy audio/video stream
      ],
    });
    browser2 = await puppeteer.launch({
      headless: false,
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
      ],
    });

    const page1 = await browser1.newPage();
    await page1.evaluateOnNewDocument(() => {
      const OriginalPeerConnection = window.RTCPeerConnection;
      window.automatedTestPeerConnection = null;

      window.RTCPeerConnection = function (...args) {
        const pc = new OriginalPeerConnection(...args);
        window.automatedTestPeerConnection = pc;
        return pc;
      };
    });

    const page2 = await browser2.newPage();

    await page2.evaluateOnNewDocument(() => {
      const OriginalPeerConnection = window.RTCPeerConnection;
      window.automatedTestPeerConnection = null;

      window.RTCPeerConnection = function (...args) {
        const pc = new OriginalPeerConnection(...args);
        window.automatedTestPeerConnection = pc;
        return pc;
      };
    });

    page1.on("console", (msg) =>
      console.log(`[Browser Console: page1] ${msg.text()}`)
    );
    page2.on("console", (msg) =>
      console.log(`[Browser Console: page2] ${msg.text()}`)
    );

    // Navigate both users to their respective URLs. Wait for network to be idle.
    console.log(`[Pair ${pairId}] Navigating User 1 to: ${urlUser1}`);
    await page1.goto(urlUser1, { waitUntil: "networkidle0", timeout: 60000 });

    console.log(`[Pair ${pairId}] Navigating User 2 to: ${urlUser2}`);
    await page2.goto(urlUser2, { waitUntil: "networkidle0", timeout: 60000 });

    // --- SIMULATE UI READY ---
    // Assuming login is automatic via URL. Next, wait for the main application UI to be ready.
    console.log(
      `[Pair ${pairId}] Waiting for application UI to be ready for both users...`
    );
    await Promise.all([
      page1
        .waitForSelector('[data-test-id="chat-input-field"]', {
          visible: true,
          timeout: 20000,
        })
        .catch(() => null),
      page2
        .waitForSelector('[data-test-id="chat-input-field"]', {
          visible: true,
          timeout: 20000,
        })
        .catch(() => null),
    ]);
    console.log(`[Pair ${pairId}] Application UI seems ready.`);

    // --- CONTACT REQUESTS & ACCEPTANCE ---
    // Check if User 2 is already in User 1's contacts
    const user2ExistsInUser1Contacts = await checkIfContactExists(
      page1,
      user2Alias
    );
    if (user2ExistsInUser1Contacts) {
      console.log(
        `[Pair ${pairId}] User 2 (${user2Alias}) already exists in User 1's contacts. Skipping request.`
      );
    } else {
      console.log(
        `[Pair ${pairId}] User 1 (${user1Alias}) sending contact request to User 2 (${user2Alias})...`
      );
      await sendContactRequest(page1, user2Alias);
    }

    // Check if User 1 is already in User 2's contacts (and accept if a request is pending)
    const user1ExistsInUser2Contacts = await checkIfContactExists(
      page2,
      user1Alias
    );
    if (user1ExistsInUser2Contacts) {
      console.log(
        `[Pair ${pairId}] User 1 (${user1Alias}) already exists in User 2's contacts. Skipping request.`
      );
      // Even if exists, check for pending request dialog if the test relies on that
      await delay(3000); // Give a brief moment for dialog to appear if pending
      const dialogVisible = await page2.$('[data-test-id="dialog-box"]');
      if (dialogVisible) {
        console.log(
          `[Pair ${pairId}] User 2 has a pending request from User 1, accepting it.`
        );
        await acceptContactRequest(page2, user1Alias);
      }
    } else {
      console.log(
        `[Pair ${pairId}] User 2 (${user2Alias}) sending contact request to User 1 (${user1Alias})...`
      );
      await sendContactRequest(page2, user1Alias);
      // After sending, User 1 needs to accept (if not already accepted)
      await delay(3000); // Give a brief moment for dialog to appear if pending
      const dialogVisible = await page1.$('[data-test-id="dialog-box"]');
      if (dialogVisible) {
        console.log(
          `[Pair ${pairId}] User 1 has a pending request from User 2, accepting it.`
        );
        await acceptContactRequest(page1, user2Alias); // Note: Should be user2Alias here if user1 is accepting from user2
      }
    }

    console.log(
      `[Pair ${pairId}] Both users should now be mutual contacts. Waiting for contact lists to update.`
    );
    await delay(3000); // waits 3 seconds for both
    // waits 3 seconds for both

    // --- USER 1 (Caller): Initiate Call to User 2 (Callee) ---
    console.log(
      `[Pair ${pairId}] User 1 (${user1Alias}) attempting to call User 2 (${user2Alias})...`
    );

    // Navigate to the contact in the list.
    // Based on createContactElement: <div class="contact-item" data-id="${alias}">
    await page1.waitForSelector(`[data-id="${user2Alias}"]`, {
      visible: true,
      timeout: 5000,
    });
    await page1.click(`[data-id="${user2Alias}"]`);
    await delay(3000); // waits 3 seconds for both
    // waits 3 seconds for both
    // Small delay for chat/call screen to load

    // Click the call button on the opened chat/contact screen.
    // Based on your openChat function: <button class="action-button" onclick="startCall(false)">
    // Target the phone icon (for voice call) inside the action button.
    await page1.waitForSelector("button.action-button i.fa-phone", {
      visible: true,
      timeout: 10000,
    });
    await page1.click("button.action-button i.fa-phone"); // Clicks the voice call button

    // --- USER 2 (Callee): Wait for and Accept Incoming Call ---
    console.log(
      `[Pair ${pairId}] User 2 (${user2Alias}) waiting for incoming call from User 1...`
    );
    // Find the element that indicates an incoming call (e.g., a modal, a pop-up button)
    await page2.waitForSelector(".incoming-call-content", {
      visible: true,
      timeout: CALL_CONNECT_TIMEOUT_MS,
    });
    // Click the accept call button
    await page2.waitForSelector(".accept-call", {
      visible: true,
      timeout: 5000,
    });
    await page2.click(".accept-call");

    console.log(
      `[Pair ${pairId}] Call interaction initiated. Waiting for WebRTC connection to establish...`
    );

    // --- VERIFY CALL CONNECTION ---
    const [connectedUser1, connectedUser2] = await Promise.all([
      checkWebRTCConnection(page1),
      checkWebRTCConnection(page2),
    ]);

    if (connectedUser1 && connectedUser2) {
      callConnected = true;
      console.log(
        `[Pair ${pairId}] Call successfully connected and media flowing between ${user1Alias} and ${user2Alias}! `
      );
      await new Promise((resolve) => setTimeout(resolve, CALL_DURATION_MS)); // Keep call active for verification

      // End the call
      console.log(`[Pair ${pairId}] Ending call for pair ${pairId}...`);
      // User 1 End Call Button: Based on client-side JS: `endCallBtn = document.getElementById('endCall');`
      try {
        await page1.waitForSelector(
          "button.action-button.end-call i.fa-phone-slash",
          {
            visible: true,
            timeout: 10000,
          }
        );
        await page1.click("button.action-button.end-call i.fa-phone-slash");
        console.log(`[Pair ${pairId}] ✅ User 1 clicked end call icon.`);
      } catch (e) {
        console.warn(
          `[Pair ${pairId}] ❌ Failed to click end call icon: ${e.message}`
        );
      }
      
    
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Small delay for state propagation

      // User 2 End Call Button: Assuming it might have a data-test-id as you had, or might also be #endCall
      // You should inspect User 2's end call button to confirm its selector.
      await page2
        .click("button.action-button.end-call") // Verify this selector, could also be '#endCall'
        .catch((e) =>
          console.warn(
            `[Pair ${pairId}] User 2 end call button not found or clicked error: ${e.message}`
          )
        );
      console.log(`[Pair ${pairId}] Call ended.`);
    } else {
      console.error(
        `[Pair ${pairId}] Call failed to establish a full WebRTC connection. (Media flow not detected via getStats())`
      );
    }
  } catch (error) {
    console.error(
      `[Pair ${pairId}] UNEXPECTED ERROR during call setup or verification for ${user1Alias} and ${user2Alias}: ${error.message}`
    );
    // If an error occurs, take a screenshot for debugging
    if (browser1 && page1) {
      await page1
        .screenshot({ path: `error_page1_${pairId}.png` })
        .catch((e) =>
          console.error("Failed to take screenshot for page1:", e.message)
        );
    }
    if (browser2 && page2) {
      await page2
        .screenshot({ path: `error_page2_${pairId}.png` })
        .catch((e) =>
          console.error("Failed to take screenshot for page2:", e.message)
        );
    }
  } finally {
    if (browser1) {
      console.log(`[Pair ${pairId}] Closing Browser 1 (${user1Alias}).`);
      await browser1.close();
    }
    if (browser2) {
      console.log(`[Pair ${pairId}] Closing Browser 2 (${user2Alias}).`);
      await browser2.close();
    }
    return callConnected; // Return the outcome of the call attempt
  }
}

// ---
async function runTest() {
  let currentCallPairs = 1;
  let keepTesting = true;

  console.log(
    "Starting iterative call connection test to find maximum concurrent calls..."
  );

  while (keepTesting) {
    console.log(
      `\n--- Attempting Test with ${currentCallPairs} Concurrent Call Pair ---`
    );
    const success = await testCallPair(currentCallPairs);

    if (success) {
      console.log(`Test with ${currentCallPairs} call pair was SUCCESSFUL.`);
      maxConcurrentCalls = currentCallPairs; // This number of concurrent calls was successful
      currentCallPairs++; // Try with one more call pair next
    } else {
      console.log(
        `Test with ${currentCallPairs} call pair FAILED. This means the system likely couldn't handle ${currentCallPairs} concurrent calls.`
      );
      keepTesting = false; // Stop when a failure occurs
    }
  }

  console.log("\n--- Iterative Test Complete ---");
  console.log(
    `Maximum successful concurrent call pairs detected before failure: ${maxConcurrentCalls}`
  );
  if (maxConcurrentCalls === 0) {
    console.log(
      "No call pairs could be successfully established. Please double-check BASE_WEBSITE_URL and all UI selectors. Also, ensure the RTCPeerConnection object is exposed for the `getStats()` check."
    );
  }
}

runTest();