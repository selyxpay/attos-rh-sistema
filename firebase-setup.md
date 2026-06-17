# R&T VAGAS IA — Configuração do Firebase

O sistema usa **Firestore** (banco) + **Storage** (arquivos). Siga os passos abaixo.

## 1. Criar o projeto
1. Acesse https://console.firebase.google.com → **Adicionar projeto** → nome `rt-vagas-ia` → criar.

## 2. Ativar o Firestore (banco de dados)
1. Menu **Criação → Firestore Database → Criar banco de dados**.
2. Local: **southamerica-east1 (São Paulo)**.
3. Inicie em **modo de teste** (depois aplicamos as regras abaixo).

## 3. Ativar o Storage (arquivos: RG/CPF/comprovantes)
1. Menu **Criação → Storage → Começar**.
2. Mesmo local (São Paulo).
3. ⚠️ O Firebase pode pedir o plano **Blaze** (pague-conforme-usa) para ligar o Storage. Há cota grátis generosa (5 GB); defina um **alerta de orçamento** em *Faturamento* para ficar tranquilo.

## 4. Pegar a configuração e colar no sistema
1. **Engrenagem ⚙️ → Configurações do projeto → Seus apps → ícone Web `</>`** → registrar app.
2. Copie o objeto `firebaseConfig` e cole em **`js/firebase-sync.js`** (linhas no topo, substituindo os `COLE_AQUI`):
```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "rt-vagas-ia.firebaseapp.com",
  projectId: "rt-vagas-ia",
  storageBucket: "rt-vagas-ia.appspot.com",   // use exatamente o que o console mostrar
  messagingSenderId: "...",
  appId: "..."
};
```

## 5. Regras de segurança (nível teste)
**Firestore** → aba **Regras** → cole e publique:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /rt_sistema/{doc} {
      allow read, write: if true;
    }
  }
}
```
**Storage** → aba **Regras** → cole e publique:
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /documentos/{allPaths=**} {
      allow read, write: if true;
    }
  }
}
```
> ⚠️ Estas regras são abertas (nível **teste**). Para produção com dados reais (CPF/RG), trancar com login de verdade depois.

## 6. Semear e publicar
1. Abra o `index.html` e **entre com o admin uma vez** (inicializa a nuvem).
2. Publique a pasta no **Netlify** (arraste a pasta) — só hospeda o código; os dados ficam no Firebase.

## Estrutura usada
- Firestore: coleção **`rt_sistema`**, documento **`estado`**, campo **`dados`** (todo o sistema, sem os arquivos pesados).
- Storage: pasta **`documentos/`** (RG, CPF, comprovantes); no banco fica só o link.
