-- À exécuter dans l'éditeur SQL de ton projet Supabase (onglet "SQL Editor"),
-- APRÈS avoir fait les deux étapes ci-dessous dans le dashboard.
--
-- Pourquoi : la table `statut` est en lecture publique. Pour que la page /admin
-- puisse la modifier, il faut une règle d'écriture réservée à TOI. La clé "anon"
-- du site étant publique, on ne peut pas lui donner ce droit : on passe par un
-- compte Supabase Auth (email + mot de passe) que toi seul connais.
--
-- ÉTAPE 1 — créer ton compte :
--   Authentication > Users > Add user > Create new user
--   (renseigne ton email et un mot de passe, coche "Auto Confirm User")
--
-- ÉTAPE 2 — fermer les inscriptions (IMPORTANT, sinon n'importe qui pourrait
--   se créer un compte avec la clé publique) :
--   Authentication > Sign In / Providers > désactive "Allow new users to sign up"
--   (le libellé exact peut varier selon la version du dashboard)
--
-- ÉTAPE 3 — remplace TON-EMAIL@exemple.com ci-dessous (deux fois) par l'email
--   du compte créé à l'étape 1, puis exécute ce script.

create policy "modification du statut par moi seul"
  on statut for update
  to authenticated
  using ((auth.jwt() ->> 'email') = 'TON-EMAIL@exemple.com')
  with check ((auth.jwt() ->> 'email') = 'TON-EMAIL@exemple.com');

-- Pour annuler : drop policy "modification du statut par moi seul" on statut;
