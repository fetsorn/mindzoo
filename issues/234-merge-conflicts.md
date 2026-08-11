# Document Title

resolve function should take a hunk set, use it to merge conflicts. if no set provided, should revert merge and return a set of hunks.
ui in footer should show a merge button when in conflict.
on click the footer should unfold up like an ios sheet and show the user each hunk with a fetched context, and a button to choose ours or theirs.

for starters, just ask user to choose ours or theirs, without even showing then hunks.

three-way merge should run as a dry run in case of mistake and return a data structure with hunk identifiers and hunk context. hunk context is lines parsed into csvs grains with add/remove diff directives. the merge should accept a hunk resolution data structure which says whether to apply ours, theirs or base version of the hunk.

https://codeberg.org/mergiraf/mergiraf/src/branch/main/src/parsed_merge.rs https://docs.rs/git2/0.20.2/git2/build/struct.CheckoutBuilder.html#method.dry_run

csvs-rs cli should be able to register as a git merge driver, like mergiraf. where you set [merge csvs] in .git/config

csvs-rs should be able to be used instead of the git merge without a driver just by applying the merge function threeway between remote, local and git-merge-base on-disk.

csvs-js should be able to use the data structure in isomorphic merge-driver https://isomorphic-git.org/docs/en/mergeDriver

in the ui, the hunk context should be used to search more context on demand and let user see the sets of grains with context in the expanded footer, like an iOS sheet https://developer.apple.com/design/human-interface-guidelines/sheets
