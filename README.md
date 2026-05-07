# joamag/cleanup-hosted

Simple GitHub action to cleanup an hosted GitHub Runner environment.

## Build

```bash
npm install
npm run build
```

## Test

```bash
npm test
```

## Usage

```yaml
- uses: joamag/cleanup-hosted@master
  with:
    remove-temp: true
    remove-home-cache: true
    remove-home-colony: true
    remove-tools: true
```
