// ---------------Selenium- webdriver----------------------

// const { timeout } = require('puppeteer-core');
const { Builder, By, Key, until } = require('selenium-webdriver');

(async function example() {
  let driver = await new Builder().forBrowser('chrome').build();

  try {
    await driver.get('https://www.google.com');
    await driver.findElement(By.name('q')).sendKeys('Selenium WebDriver', Key.RETURN);
    await driver.wait(until.titleContains('Selenium WebDriver'),10000);
    console.log('Search completed and results loaded!');
  } finally {
    await driver.quit();
  }
})();
