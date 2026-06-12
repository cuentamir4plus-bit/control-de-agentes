# Playwright Locators

Prioridad de selectores: getByRole > getByLabel > getByText > locator('[data-testid]').
Evito XPath y selectores CSS frágiles.
Uso async/await y page.waitForLoadState() donde sea necesario.
