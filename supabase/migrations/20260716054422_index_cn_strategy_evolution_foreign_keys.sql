create index if not exists cn_strategy_versions_parent_version_idx
  on public.cn_strategy_versions (parent_version);

create index if not exists cn_strategy_reviews_current_version_idx
  on public.cn_strategy_reviews (current_version);

create index if not exists cn_strategy_reviews_proposed_version_idx
  on public.cn_strategy_reviews (proposed_version);
