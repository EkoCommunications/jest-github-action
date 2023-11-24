# Forked from [mattallty/jest-github-action](https://github.com/mattallty/jest-github-action).
I want to sincerely thank [mattallty](https://github.com/mattallty) for their initial work on the Jest Github Action. Their effort laid the groundwork for what we have achieved, and I am truly grateful for that.

Using their repository as a starting point has enabled us to enhance the action with new features. I appreciate the opportunity to build upon their work and improve it further.

A big thank you goes to [mattallty](https://github.com/mattallty) for their invaluable contribution. Their original work has been essential to our project's development.

# Jest Github Action

Main features:

- Add status checks with code annotations to your pull requests
- Comment your pull requests with code coverage table (if tests succeeded)

## Coverage example

![Coverage](assets/coverage.png)

## Check annotations example

![Fail](assets/fail.png)

## Usage

You can now consume the action by referencing the v1 branch

```yaml
uses: EkoCommunications/jest-github-action@v1.1
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Overriding the test command

By default, this action will execute `npm test` to run your tests.
You can change this behavior by providing a custom `test-command` like this:

```yaml
uses: EkoCommunications/jest-github-action@v1.1
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
with:
  # this is just an example, this could be any command that will trigger jest
  test-command: "yarn test"
```

### Running tests only on changed files

```yaml
uses: EkoCommunications/jest-github-action@v1.1
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
with:
  # Runs tests related to the changes since the base branch of your pull request
  # Default to false if not set
  changes-only: true
```

### Silencing the code coverage comment

```yaml
uses: EkoCommunications/jest-github-action@v1.1
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
with:
  # To avoid reporting code coverage, set this variable to false
  coverage-comment: false
```

### Running tests in a subdirectory

For running tests in folders other than root, supply a working-directory.

```yaml
uses: EkoCommunications/jest-github-action@v1.1
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
with:
  working-directory: "frontend"
```


See the [actions tab](https://github.com/EkoCommunications/jest-github-action/actions) for runs of this action! :stars:

