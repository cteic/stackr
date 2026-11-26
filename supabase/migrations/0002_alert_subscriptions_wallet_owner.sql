-- alert_subscriptions: also require that the subscribed wallet belongs to the
-- caller. 0001 checked only user_id, so a user could insert or update a
-- subscription pointing at another user's watched_wallets row (staff review
-- round 2, finding M2 in #141).
--
-- The using clause stays owner-only, so a user can still read and delete a
-- row they own. The check clause gates inserts and updates.

drop policy "alert_subscriptions owned" on public.alert_subscriptions;

create policy "alert_subscriptions owned"
  on public.alert_subscriptions for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.watched_wallets w
      where w.id = wallet_id
        and w.user_id = auth.uid()
    )
  );
