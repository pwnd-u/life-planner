# Set default branch to `main` (one-time)

Your repo has two branches with the **same code**: `master` (current default) and `main`. To avoid confusion and then remove `master`:

1. On GitHub: **Settings** → **Branches** (left sidebar).
2. Under **Default branch**, click the switch/edit next to `master`, choose **main**, confirm.
3. Then in a terminal: `git push origin --delete master` (or delete `master` from the Branches page on GitHub).

After that, the repo has a single default branch: `main`. You can delete this file afterward if you want.
