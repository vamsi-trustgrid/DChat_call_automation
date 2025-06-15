const puppeteer = require('puppeteer');
const password = '1234';
let callSuccess = 0;
let callFailure = 0;

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

const generateUsernames = (count) => {
  const usernames = [];
  for (let i = 1; i <= count; i++) {
    usernames.push(`tru12${String(i).padStart(2, '0')}`);
  }
  return usernames;
};

async function createSession(browser, username) {
  const page = await browser.newPage();
  const url = `https://dchat.staging.trustgrid.com/?username=${username}&password=${password}`;
  await page.goto(url, { waitUntil: 'networkidle2' });
  await page.bringToFront();
  await page.click('body'); // Simulate user gesture
  return page;
}

async function clickConfirmButtonByText(page, user) {
  await page.bringToFront();
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const text = await page.evaluate((el) => el.innerText.trim().toLowerCase(), btn);
    if (text === 'confirm') {
      await btn.click();
      console.log(`${user} accepted the contact request`);
      return true;
    }
  }
  console.log(`${user} could not find a 'confirm' button by text`);
  return false;
}

async function clickOnOk(page, user) {
  await page.bringToFront();
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const text = await page.evaluate((el) => el.innerText.trim().toLowerCase(), btn);
    if (text === 'ok') {
      await btn.click();
      console.log(`${user} clicked OK`);
      return true;
    }
  }
  console.log(`${user} could not find an 'ok' button`);
  return false;
}

async function testCall(browser, user1, user2) {
 // Step 1: Load user2 first and give time to connect
  const page2 = await createSession(browser, user2);
  await delay(12000); 

  // Step 2: Now load user1
  const page1 = await createSession(browser, user1);
  await delay(5000); 
  try {
    // USER1 sends request
    await page1.bringToFront();
    await page1.waitForSelector('button.add-button');
    await page1.click('button.add-button');
    await delay(3000);

    await page1.waitForSelector('input.dialog-input');
    await page1.type('input.dialog-input', user2);
    await delay(3000);

    await page1.waitForSelector('button.dialog-button.confirm');
    await page1.click('button.dialog-button.confirm');
    await delay(3000);

    const request = await clickOnOk(page1, user1);
    if (!request) console.log(`${user1} request OK not clicked`);

    console.log(`${user1} sent a contact request to ${user2}`);

    // USER2 accepts request
    await delay(10000);
    const accepted = await clickConfirmButtonByText(page2, user2);
    if (!accepted) console.log(`${user2} did not accept request`);

    await delay(3000);
    const ok2 = await clickOnOk(page2, user2);
    if (!ok2) console.log(`${user2} OK not clicked`);

    await delay(3000);

    const ok1 = await clickOnOk(page1, user1);
    if (!ok1) console.log(`${user1} OK not clicked`);

    await delay(3000);

    // Click contact and initiate call
    await page1.bringToFront();
    try {
      await page1.waitForSelector('.contact-item', { visible: true });
      await page1.click('.contact-item');
      console.log(`${user1} clicked contact-item`);
    } catch (err) {
      console.log(` Contact-item click failed for ${user1}: ${err.message}`);
    }

    await delay(5000);

    try {
      await page1.evaluate(() => {
        const buttons = document.querySelectorAll('.action-button');
        for (let btn of buttons) {
          if (btn.getAttribute('onClick') === 'startCall(false)') {
            btn.click();
            break;
          }
        }
      });
      console.log(`${user1} started audio call`);
    } catch (err) {
      console.log(` Audio call failed by ${user1}: ${err.message}`);
    }

    await delay(5000);

    // USER2 accepts the call
    await page2.bringToFront();
    try {
      await page2.waitForSelector('button.accept-call', { timeout: 12000 });
      await page2.click('button.accept-call');
      console.log(`${user2} accepted the call`);
      callSuccess++;
    } catch (err) {
      console.log(`${user2} did not accept the call: ${err.message}`);
      callFailure++;
    }

    await delay(5000);
  } catch (err) {
    console.error(`Error in test between ${user1} and ${user2}: ${err.message}`);
  } finally {
    await page1.close();
    await page2.close();
  }
}

// Entry point
(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 50,
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--start-maximized'
    ],
    defaultViewport: null
  });

  const totalUsers = 10;
  const usernames = generateUsernames(totalUsers);

  for (let i = 0; i < usernames.length; i += 2) {
    const user1 = usernames[i];
    const user2 = usernames[i + 1];
    if (!user2) break;

    console.log(`\nTesting pair: ${user1} ↔ ${user2}`);
    await testCall(browser, user1, user2);
    await delay(10000);
  }

  console.log(`Call Success: ${callSuccess}`);
  console.log(`Call Failure: ${callFailure}`);
  await browser.close();
})();
