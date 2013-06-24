Bioturk::Application.routes.draw do

  get "liaison/info"
  get "liaison/take"
  get "liaison/release"
  get "liaison/produce"

  get "protocol_tree/home"
  get "protocol_tree/subtree"
  get "protocol_tree/raw"

  resources :object_types do 
    resources :items do
      collection do
        get 'update'
      end
    end
  end

  root to: 'static_pages#home'

  match '/',        to: 'static_pages#home'
  match '/help',    to: 'static_pages#help'
  match '/about',   to: 'static_pages#about'
  match '/signin',  to: 'sessions#new'
  match '/signout', to: 'sessions#destroy', via: :delete
  
  match '/signup', to: 'users#new'

  resources :users

  resources :sessions, only: [:new, :create, :destroy]

  match '/item', to: 'items#update'

end
